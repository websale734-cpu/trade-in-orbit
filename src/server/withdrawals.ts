import "server-only";
import { db } from "./db";
import { encryptString } from "./crypto";
import { Decimal, LedgerError, mapLedgerError, postEntry, systemLedgerAccount } from "./ledger";
import { checkCode } from "./auth/codes";
import { verifyAndConsumeTotp } from "./auth/totp";
import { logSecurityEvent } from "./auth/security-log";
import { notify } from "./notify/notifications";
import { limitsFor, methodMode } from "./funding";
import { getLivePrice } from "@/lib/market/price";
import { FIAT_METHODS, NETWORK_FEES, WITHDRAWAL_FEES } from "@/config/funding";
import {
  Prisma,
  type PaymentMethod,
  type User,
  type Withdrawal,
  type WithdrawalStatus,
} from "@/generated/prisma/client";

/**
 * Withdrawals.
 *
 * Requesting a withdrawal immediately moves amount + fee from the user's
 * account into WITHDRAWAL_HOLD, so the funds can't be spent twice while it's
 * reviewed. From there it either completes (hold -> external + fees) or is
 * rejected (hold -> back to the user). Status:
 *   REQUESTED -> UNDER_REVIEW -> APPROVED -> SENT -> COMPLETED
 *                          \-> REJECTED (with reason, funds returned)
 * A second factor is required: an authenticator code if 2FA is on, otherwise an
 * emailed code. Crypto withdrawals must go to a saved, email-confirmed address.
 */
const TX = { timeout: 20_000, maxWait: 10_000 } as const;

export function withdrawalFee(method: PaymentMethod, assetCode: string, amount: Decimal, decimals: number): Decimal {
  if (method === "CRYPTO") return new Decimal(NETWORK_FEES[assetCode]?.fee ?? "0");
  const f = WITHDRAWAL_FEES[method];
  return new Decimal(f.flat).plus(amount.mul(f.bps).div(10_000)).toDecimalPlaces(decimals, Prisma.Decimal.ROUND_UP);
}

export type Destination =
  | { kind: "BANK"; holder: string; bankName: string; account: string }
  | { kind: "MOBILE_MONEY"; provider: string; phone: string }
  | { kind: "CARD"; last4: string }
  | { kind: "CRYPTO"; addressId: string };

/** Keep a masked copy for display and an encrypted copy of the full details. */
function storeDestination(d: Destination, cryptoAddress?: string): Prisma.InputJsonValue {
  switch (d.kind) {
    case "BANK":
      return {
        kind: d.kind,
        holder: d.holder,
        bankName: d.bankName,
        masked: `•••• ${d.account.slice(-4)}`,
        enc: encryptString(d.account),
      };
    case "MOBILE_MONEY":
      return { kind: d.kind, provider: d.provider, masked: `•••• ${d.phone.slice(-4)}`, enc: encryptString(d.phone) };
    case "CARD":
      return { kind: d.kind, masked: `Card •••• ${d.last4}` };
    case "CRYPTO":
      return {
        kind: d.kind,
        masked: `${cryptoAddress!.slice(0, 8)}…${cryptoAddress!.slice(-6)}`,
        address: cryptoAddress!,
      };
  }
}

export async function requestWithdrawal(input: {
  user: User;
  accountId: string;
  method: PaymentMethod;
  assetCode: string;
  amount: string;
  destination: Destination;
  confirmationCode: string;
  scheduledFor?: Date | null;
}) {
  const { user, method } = input;
  if (user.kycStatus !== "APPROVED") throw new LedgerError("Verify your identity before withdrawing.", "INVALID");
  const mode = methodMode(method === "CARD" ? "BANK" : method); // card payouts use the same rails as bank in sandbox
  if (mode === "unavailable") throw new LedgerError("This withdrawal method isn't available yet.", "INVALID");

  const asset = await db.asset.findFirst({ where: { code: input.assetCode, enabled: true } });
  if (!asset) throw new LedgerError("Unsupported asset.", "NOT_FOUND");
  if (FIAT_METHODS.includes(method) !== (asset.type === "FIAT"))
    throw new LedgerError("This method can't be used for that asset.", "INVALID");
  const account = await db.account.findFirst({
    where: { id: input.accountId, userId: user.id, type: { not: "DEMO" } },
  });
  if (!account) throw new LedgerError("Account not found.", "NOT_FOUND");

  const amount = new Decimal(input.amount.replace(/,/g, ""));
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > asset.decimals)
    throw new LedgerError(`Enter a valid amount (up to ${asset.decimals} decimal places).`, "INVALID_AMOUNT");

  let cryptoAddress: string | undefined;
  if (input.destination.kind === "CRYPTO") {
    const addr = await db.withdrawalAddress.findFirst({
      where: { id: input.destination.addressId, userId: user.id, assetCode: asset.code, confirmedAt: { not: null } },
    });
    if (!addr) throw new LedgerError("Choose a confirmed address from your address book.", "INVALID");
    cryptoAddress = addr.address;
  }

  const limits = await limitsFor(user);
  const usdValue = amount.mul(await getLivePrice(asset.code)).toNumber();
  if (usdValue > limits.withdrawRemaining)
    throw new LedgerError(
      `This exceeds your 24-hour withdrawal limit ($${limits.withdrawRemaining.toFixed(2)} remaining).`,
      "INVALID_AMOUNT",
    );

  // Second factor, checked last so a typo elsewhere doesn't burn a code.
  const ok = user.totpSecretEnc
    ? await verifyAndConsumeTotp(user.id, user.totpSecretEnc, input.confirmationCode)
    : (await checkCode(user.id, "WITHDRAWAL_CONFIRM", input.confirmationCode)).ok;
  if (!ok)
    throw new LedgerError(
      user.totpSecretEnc ? "Incorrect authenticator code." : "Incorrect or expired email code.",
      "INVALID",
    );

  const fee = withdrawalFee(method, asset.code, amount, asset.decimals);
  const total = amount.plus(fee);
  const scheduled = input.scheduledFor && input.scheduledFor.getTime() > Date.now() ? input.scheduledFor : null;

  try {
    const w = await db.$transaction(async (tx) => {
      const userLa = await tx.ledgerAccount.upsert({
        where: { accountId_assetCode: { accountId: account.id, assetCode: asset.code } },
        update: {},
        create: { accountId: account.id, assetCode: asset.code },
      });
      const hold = await systemLedgerAccount(tx, "WITHDRAWAL_HOLD", asset.code);
      const entry = await postEntry(tx, {
        type: "WITHDRAWAL",
        description: `Withdrawal requested: ${amount} ${asset.code} (+ ${fee} fee) held for review`,
        userId: user.id,
        metadata: { hold: true },
        postings: [
          { ledgerAccountId: userLa.id, assetCode: asset.code, amount: total.negated() },
          { ledgerAccountId: hold.id, assetCode: asset.code, amount: total },
        ],
      });
      return tx.withdrawal.create({
        data: {
          userId: user.id,
          accountId: account.id,
          method,
          assetCode: asset.code,
          amount,
          fee,
          destination: storeDestination(input.destination, cryptoAddress),
          addressId: input.destination.kind === "CRYPTO" ? input.destination.addressId : null,
          scheduledFor: scheduled,
          sandbox: mode === "sandbox",
          holdEntryId: entry.id,
          // Unscheduled requests go straight into the review queue.
          status: scheduled ? "REQUESTED" : "UNDER_REVIEW",
          reviewAt: scheduled ? null : new Date(),
        },
      });
    }, TX);
    await notify(user.id, {
      type: "ACCOUNT",
      title: scheduled ? "Withdrawal scheduled" : "Withdrawal requested",
      body: `${amount} ${asset.code} ${scheduled ? `scheduled for ${scheduled.toDateString()}` : "is being reviewed"}.`,
      link: "/withdraw",
    }).catch(() => {});
    return w;
  } catch (err) {
    mapLedgerError(err);
  }
}

const NEXT: Partial<Record<WithdrawalStatus, WithdrawalStatus>> = {
  REQUESTED: "UNDER_REVIEW",
  UNDER_REVIEW: "APPROVED",
  APPROVED: "SENT",
  SENT: "COMPLETED",
};

/**
 * Move a withdrawal one step forward (admin panel in Phase 5; sandbox tools in
 * development). Completion posts hold -> external clearing + fees.
 */
export async function advanceWithdrawal(id: string, txRef?: string): Promise<Withdrawal | null> {
  const w = await db.withdrawal.findUnique({ where: { id } });
  if (!w || !NEXT[w.status]) return null;
  const next = NEXT[w.status]!;
  const stamp = { UNDER_REVIEW: "reviewAt", APPROVED: "approvedAt", SENT: "sentAt", COMPLETED: "completedAt" }[
    next as string
  ]!;

  const updated = await db.$transaction(async (tx) => {
    const claimed = await tx.withdrawal.updateMany({
      where: { id, status: w.status },
      data: { status: next, [stamp]: new Date(), ...(txRef ? { txRef } : {}) },
    });
    if (claimed.count !== 1) return null;
    if (next === "COMPLETED") {
      const hold = await systemLedgerAccount(tx, "WITHDRAWAL_HOLD", w.assetCode);
      const external = await systemLedgerAccount(
        tx,
        w.sandbox ? "SANDBOX_EXTERNAL" : "EXTERNAL_CLEARING",
        w.assetCode,
        true,
      );
      const fees = await systemLedgerAccount(tx, "FEES", w.assetCode);
      await postEntry(tx, {
        type: "WITHDRAWAL",
        description: `Withdrawal completed: ${w.amount} ${w.assetCode}${w.sandbox ? " (sandbox)" : ""}`,
        userId: w.userId,
        idempotencyKey: `withdrawal-complete:${w.id}`,
        metadata: { withdrawalId: w.id, sandbox: w.sandbox },
        postings: [
          { ledgerAccountId: hold.id, assetCode: w.assetCode, amount: w.amount.plus(w.fee).negated() },
          { ledgerAccountId: external.id, assetCode: w.assetCode, amount: w.amount },
          { ledgerAccountId: fees.id, assetCode: w.assetCode, amount: w.fee },
        ],
      });
    }
    return tx.withdrawal.findUnique({ where: { id } });
  }, TX);
  if (updated && (next === "SENT" || next === "COMPLETED")) {
    await notify(w.userId, {
      type: "ACCOUNT",
      title: next === "SENT" ? "Withdrawal sent" : "Withdrawal completed",
      body: `${w.amount} ${w.assetCode} ${next === "SENT" ? "is on its way" : "has arrived"}.`,
      link: "/withdraw",
    }).catch(() => {});
  }
  return updated;
}

/** Reject and return the held funds (amount + fee) to the user. */
export async function rejectWithdrawal(id: string, reason: string) {
  const w = await db.withdrawal.findUnique({ where: { id } });
  if (!w || ["COMPLETED", "REJECTED", "SENT"].includes(w.status)) return null;
  await db.$transaction(async (tx) => {
    const claimed = await tx.withdrawal.updateMany({
      where: { id, status: w.status },
      data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: reason },
    });
    if (claimed.count !== 1) throw new LedgerError("Withdrawal changed; try again.", "INVALID");
    const hold = await systemLedgerAccount(tx, "WITHDRAWAL_HOLD", w.assetCode);
    const user = await tx.ledgerAccount.findUniqueOrThrow({
      where: { accountId_assetCode: { accountId: w.accountId, assetCode: w.assetCode } },
    });
    await postEntry(tx, {
      type: "WITHDRAWAL",
      description: `Withdrawal rejected: ${w.amount.plus(w.fee)} ${w.assetCode} returned`,
      userId: w.userId,
      idempotencyKey: `withdrawal-reject:${w.id}`,
      metadata: { withdrawalId: w.id, reason },
      postings: [
        { ledgerAccountId: hold.id, assetCode: w.assetCode, amount: w.amount.plus(w.fee).negated() },
        { ledgerAccountId: user.id, assetCode: w.assetCode, amount: w.amount.plus(w.fee) },
      ],
    });
  }, TX);
  await notify(w.userId, {
    type: "ACCOUNT",
    title: "Withdrawal rejected",
    body: `Your ${w.amount} ${w.assetCode} withdrawal was rejected: ${reason}. The funds are back in your account.`,
    link: "/withdraw",
  }).catch(() => {});
}

/** Move scheduled withdrawals whose date has arrived into the review queue. */
export async function processScheduledWithdrawals(): Promise<number> {
  const { count } = await db.withdrawal.updateMany({
    where: { status: "REQUESTED", scheduledFor: { lte: new Date() } },
    data: { status: "UNDER_REVIEW", reviewAt: new Date() },
  });
  return count;
}

// ---------------------------------------------------------------------------
// Address book
// ---------------------------------------------------------------------------

/** Basic per-network format checks; the custody provider validates definitively. */
const ADDRESS_FORMATS: Record<string, RegExp> = {
  BTC: /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
  ETH: /^0x[a-fA-F0-9]{40}$/,
  USDT: /^0x[a-fA-F0-9]{40}$/,
  LINK: /^0x[a-fA-F0-9]{40}$/,
  BNB: /^0x[a-fA-F0-9]{40}$/,
  AVAX: /^0x[a-fA-F0-9]{40}$/,
  SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  XRP: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/,
  TRX: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  DOGE: /^D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}$/,
  ADA: /^addr1[a-z0-9]{50,120}$/,
  DOT: /^1[1-9A-HJ-NP-Za-km-z]{45,47}$/,
};

export function validAddress(assetCode: string, address: string): boolean {
  const re = ADDRESS_FORMATS[assetCode];
  return !!re && re.test(address);
}

/** Save a new address (unconfirmed). The user confirms it with an emailed code. */
export async function addWithdrawalAddress(user: User, assetCode: string, label: string, address: string) {
  const clean = address.trim();
  if (!validAddress(assetCode, clean))
    throw new LedgerError(`That doesn't look like a valid ${assetCode} address.`, "INVALID");
  const saved = await db.withdrawalAddress.upsert({
    where: { userId_assetCode_address: { userId: user.id, assetCode, address: clean } },
    update: { label },
    create: { userId: user.id, assetCode, label, address: clean },
  });
  return saved;
}

export async function confirmWithdrawalAddress(user: User, addressId: string, code: string) {
  const result = await checkCode(user.id, "ADDRESS_CONFIRM", code);
  if (!result.ok) throw new LedgerError(result.error, "INVALID");
  const { count } = await db.withdrawalAddress.updateMany({
    where: { id: addressId, userId: user.id, confirmedAt: null },
    data: { confirmedAt: new Date() },
  });
  if (count !== 1) throw new LedgerError("Address not found.", "NOT_FOUND");
  await logSecurityEvent("WITHDRAWAL_ADDRESS_ADDED", user.id, { addressId });
}
