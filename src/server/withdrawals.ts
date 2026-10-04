import "server-only";
import { db } from "./db";
import { Decimal, LedgerError, mapLedgerError, postEntry, systemLedgerAccount } from "./ledger";
import { checkCode } from "./auth/codes";
import { totpWouldAccept, verifyAndConsumeTotp } from "./auth/totp";
import { notify } from "./notify/notifications";
import { notifyDecision } from "./notify/decisions";
import { cryptoMode } from "./funding";
import { coinNetworks } from "@/config/funding";
import { getSettings, type Settings } from "./settings";
import { Prisma, type User, type Withdrawal, type WithdrawalStatus } from "@/generated/prisma/client";

/**
 * Withdrawals (crypto only; there is no cash balance).
 *
 * Requesting a withdrawal immediately deducts amount + fee from the user's
 * account into WITHDRAWAL_HOLD, so the funds can't be spent twice while it's
 * pending. An admin then approves it (hold -> external + fees, COMPLETED) or
 * rejects it (hold -> back to the user, REJECTED). Status:
 *   REQUESTED (scheduled) -> UNDER_REVIEW -> COMPLETED  (approved)
 *                                        \-> REJECTED   (funds returned)
 * The customer only ever sees Pending, Success or Failed.
 * Every request needs an emailed code, plus an authenticator code if 2FA is on.
 * The wallet address is typed in with each request and accepted as typed, even
 * blank or malformed; the admin decides on approval.
 */
const TX = { timeout: 20_000, maxWait: 10_000 } as const;

/** Network fee, charged in the coin being withdrawn (passed through at cost). */
export function withdrawalFee(fees: Settings["fees"], assetCode: string): Decimal {
  return new Decimal(fees.network[assetCode]?.fee ?? "0");
}

export type Destination = { kind: "CRYPTO"; address: string; network: string };

function storeDestination(d: Destination): Prisma.InputJsonValue {
  return {
    kind: d.kind,
    masked: d.address.length > 16 ? `${d.address.slice(0, 8)}…${d.address.slice(-6)}` : d.address || "(not provided)",
    address: d.address,
    network: d.network,
  };
}

type WithdrawalInput = {
  user: User;
  accountId: string;
  assetCode: string;
  /** Network id for coins on several networks (USDT: TRC20 / ERC20). */
  networkId?: string;
  amount: string;
  address: string;
  scheduledFor?: Date | null;
};

/**
 * Every check that doesn't need the confirmation codes. Read-only: nothing is
 * held. The confirmation screen is shown once this passes, and
 * requestWithdrawal runs it again before holding the funds.
 */
export async function prepareWithdrawal(input: WithdrawalInput) {
  const { user } = input;
  if (user.kycStatus !== "APPROVED") throw new LedgerError("Verify your identity before withdrawing.", "INVALID");
  // Paid out manually after admin approval.
  const mode = cryptoMode();

  const asset = await db.asset.findFirst({ where: { code: input.assetCode, enabled: true, type: "CRYPTO" } });
  if (!asset) throw new LedgerError("This coin isn't supported.", "NOT_FOUND");
  const networks = coinNetworks(asset.code);
  const network = networks.length === 1 ? networks[0] : networks.find((n) => n.id === input.networkId);
  if (!network) throw new LedgerError("Choose a network.", "INVALID");
  const account = await db.account.findFirst({
    where: { id: input.accountId, userId: user.id, type: { not: "DEMO" } },
  });
  if (!account) throw new LedgerError("Account not found.", "NOT_FOUND");

  const amount = new Decimal(input.amount.replace(/,/g, ""));
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > asset.decimals)
    throw new LedgerError(`Enter a valid amount (up to ${asset.decimals} decimal places).`, "INVALID_AMOUNT");

  // The address isn't checked here; the admin reviews it before approving.
  const destination: Destination = { kind: "CRYPTO", address: input.address, network: network.label };
  const fee = withdrawalFee((await getSettings()).fees, asset.code);
  const total = amount.plus(fee);
  // Early, friendly check; the ledger's non-negative constraint is what actually enforces it.
  const from = await db.ledgerAccount.findUnique({
    where: { accountId_assetCode: { accountId: account.id, assetCode: asset.code } },
  });
  if (!from || from.balance.lt(total)) throw new LedgerError("Insufficient balance.", "INSUFFICIENT_FUNDS");

  const scheduled = input.scheduledFor && input.scheduledFor.getTime() > Date.now() ? input.scheduledFor : null;
  return { asset, account, amount, fee, total, mode, scheduled, network, destination };
}

/**
 * Hold the funds and queue the withdrawal for admin review. Needs the emailed
 * code, plus an authenticator code when 2FA is on.
 */
export async function requestWithdrawal(input: WithdrawalInput & { emailCode: string; totpCode?: string }) {
  const { user } = input;
  const { asset, account, amount, fee, total, mode, scheduled, destination } = await prepareWithdrawal(input);

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
        description: `Withdrawal ${amount} ${asset.code} (+ ${fee} ${asset.code} network fee)`,
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
          method: "CRYPTO",
          assetCode: asset.code,
          amount,
          fee,
          destination: storeDestination(destination),
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
      title: "Withdrawal pending",
      body: `Your withdrawal of ${amount} ${asset.code} is pending${scheduled ? ` (scheduled for ${scheduled.toDateString()})` : ""}. The amount has been deducted from your balance.`,
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
  if (updated)
    await notifyDecision(w.userId, {
      kind: "WITHDRAWAL_APPROVED",
      amount: w.amount.toString(),
      assetCode: w.assetCode,
    });
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
  await notifyDecision(w.userId, {
    kind: "WITHDRAWAL_REJECTED",
    amount: w.amount.toString(),
    assetCode: w.assetCode,
    refunded: w.amount.plus(w.fee).toString(),
    reason,
  });
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
