import "server-only";
import { db } from "./db";
import { encryptString } from "./crypto";
import { Decimal, LedgerError, mapLedgerError, postEntry, systemLedgerAccount } from "./ledger";
import { checkCode } from "./auth/codes";
import { totpWouldAccept, verifyAndConsumeTotp } from "./auth/totp";
import { notify } from "./notify/notifications";
import { limitsFor, methodMode } from "./funding";
import { getLivePrice } from "@/lib/market/price";
import { FIAT_METHODS } from "@/config/funding";
import { getSettings, type Settings } from "./settings";
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
 * reviewed. An admin then approves it (hold -> external + fees, COMPLETED) or
 * rejects it (hold -> back to the user, REJECTED). Status:
 *   REQUESTED (scheduled) -> UNDER_REVIEW -> COMPLETED  (approved)
 *                                        \-> REJECTED   (funds returned)
 * Every request needs an emailed code, plus an authenticator code if 2FA is on.
 * Destinations (including crypto addresses) are typed in with each request.
 */
const TX = { timeout: 20_000, maxWait: 10_000 } as const;

export function withdrawalFee(
  fees: Settings["fees"],
  method: PaymentMethod,
  assetCode: string,
  amount: Decimal,
  decimals: number,
): Decimal {
  if (method === "CRYPTO") return new Decimal(fees.network[assetCode]?.fee ?? "0");
  const f = fees.withdrawal[method];
  return new Decimal(f.flat).plus(amount.mul(f.bps).div(10_000)).toDecimalPlaces(decimals, Prisma.Decimal.ROUND_UP);
}

export type Destination =
  | { kind: "BANK"; holder: string; bankName: string; account: string }
  | { kind: "MOBILE_MONEY"; provider: string; phone: string }
  | { kind: "CARD"; last4: string }
  | { kind: "CRYPTO"; address: string };

/** Keep a masked copy for display and an encrypted copy of the full details. */
function storeDestination(d: Destination): Prisma.InputJsonValue {
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
        masked: `${d.address.slice(0, 8)}…${d.address.slice(-6)}`,
        address: d.address,
      };
  }
}

type WithdrawalInput = {
  user: User;
  accountId: string;
  method: PaymentMethod;
  assetCode: string;
  amount: string;
  destination: Destination;
  scheduledFor?: Date | null;
};

/**
 * Every check that doesn't need the confirmation codes. Read-only: nothing is
 * held. The confirmation screen is shown once this passes, and
 * requestWithdrawal runs it again before holding the funds.
 */
export async function prepareWithdrawal(input: WithdrawalInput) {
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

  if (input.destination.kind === "CRYPTO" && !validAddress(asset.code, input.destination.address))
    throw new LedgerError(`That doesn't look like a valid ${asset.code} address.`, "INVALID");

  const limits = await limitsFor(user);
  const usdValue = amount.mul(await getLivePrice(asset.code)).toNumber();
  if (usdValue > limits.withdrawRemaining)
    throw new LedgerError(
      `This exceeds your 24-hour withdrawal limit ($${limits.withdrawRemaining.toFixed(2)} remaining).`,
      "INVALID_AMOUNT",
    );

  const fee = withdrawalFee((await getSettings()).fees, method, asset.code, amount, asset.decimals);
  const total = amount.plus(fee);
  // Early, friendly check; the ledger's non-negative constraint is what actually enforces it.
  const from = await db.ledgerAccount.findUnique({
    where: { accountId_assetCode: { accountId: account.id, assetCode: asset.code } },
  });
  if (!from || from.balance.lt(total)) throw new LedgerError("Insufficient balance.", "INSUFFICIENT_FUNDS");

  const scheduled = input.scheduledFor && input.scheduledFor.getTime() > Date.now() ? input.scheduledFor : null;
  return { asset, account, amount, fee, total, mode, scheduled };
}

/**
 * Hold the funds and queue the withdrawal for admin review. Needs the emailed
 * code, plus an authenticator code when 2FA is on.
 */
export async function requestWithdrawal(input: WithdrawalInput & { emailCode: string; totpCode?: string }) {
  const { user, method } = input;
  const { asset, account, amount, fee, total, mode, scheduled } = await prepareWithdrawal(input);

  // Codes are checked last so a typo elsewhere doesn't burn one. The authenticator code
  // is checked first without using it up, so a wrong one doesn't cost an email-code attempt.
  const totpCode = input.totpCode ?? "";
  if (user.totpSecretEnc && !totpWouldAccept(user.totpSecretEnc, user.totpLastStep, totpCode))
    throw new LedgerError("Incorrect authenticator code.", "INVALID");
  const emailed = await checkCode(user.id, "WITHDRAWAL_CONFIRM", input.emailCode);
  if (!emailed.ok)
    throw new LedgerError(
      emailed.reason === "invalid" ? `Incorrect email code. ${emailed.attemptsLeft} attempt(s) left.` : emailed.error,
      "INVALID",
    );
  if (user.totpSecretEnc && !(await verifyAndConsumeTotp(user.id, user.totpSecretEnc, totpCode)))
    throw new LedgerError("That authenticator code was already used. Wait for the next one and try again.", "INVALID");

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
          destination: storeDestination(input.destination),
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

/**
 * Every status short of a final decision. The customer sees all of these as
 * "Pending"; COMPLETED shows as "Success" and REJECTED as "Failed".
 * (APPROVED/SENT are only reachable by withdrawals made before single-step approval.)
 */
export const PENDING_WITHDRAWAL_STATUSES: WithdrawalStatus[] = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "SENT"];

export function withdrawalOutcome(status: WithdrawalStatus): "PENDING" | "SUCCESS" | "FAILED" {
  return status === "COMPLETED" ? "SUCCESS" : status === "REJECTED" ? "FAILED" : "PENDING";
}

/**
 * Approve a pending withdrawal. The amount stays deducted: the held funds
 * move hold -> external clearing (+ fee to FEES) and the withdrawal completes.
 * Returns null if it was no longer pending.
 */
export async function approveWithdrawal(id: string): Promise<Withdrawal | null> {
  const w = await db.withdrawal.findUnique({ where: { id } });
  if (!w || !PENDING_WITHDRAWAL_STATUSES.includes(w.status)) return null;

  const updated = await db.$transaction(async (tx) => {
    const now = new Date();
    const claimed = await tx.withdrawal.updateMany({
      where: { id, status: w.status },
      data: { status: "COMPLETED", approvedAt: w.approvedAt ?? now, completedAt: now },
    });
    if (claimed.count !== 1) return null;
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
    return tx.withdrawal.findUnique({ where: { id } });
  }, TX);
  if (updated) {
    await notify(w.userId, {
      type: "ACCOUNT",
      title: "Withdrawal successful",
      body: `Your ${w.amount} ${w.assetCode} withdrawal was approved.`,
      link: "/withdraw",
    }).catch(() => {});
  }
  return updated;
}

/**
 * Reject and return the held funds (amount + fee) to the user, exactly as
 * they were. Returns null if it was no longer pending. A legacy SENT
 * withdrawal has already left the platform, so it can't be rejected.
 */
export async function rejectWithdrawal(id: string, reason?: string): Promise<Withdrawal | null> {
  const w = await db.withdrawal.findUnique({ where: { id } });
  if (!w || !PENDING_WITHDRAWAL_STATUSES.includes(w.status) || w.status === "SENT") return null;
  await db.$transaction(async (tx) => {
    const claimed = await tx.withdrawal.updateMany({
      where: { id, status: w.status },
      data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: reason || null },
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
    title: "Withdrawal failed",
    body: `Your ${w.amount} ${w.assetCode} withdrawal was rejected${reason ? `: ${reason}` : ""}. The funds are back in your account.`,
    link: "/withdraw",
  }).catch(() => {});
  return w;
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
// Crypto address format
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
