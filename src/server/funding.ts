import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { Decimal, ensureDefaultAccount, LedgerError, parseAmount, postEntry, systemLedgerAccount } from "./ledger";
import { notify } from "./notify/notifications";
import { notifyDecision } from "./notify/decisions";
import { coinNetworks } from "@/config/funding";
import { getSettings } from "./settings";
import { maybeAwardReferral } from "./rewards";
import { getDepositWallets, walletKey } from "./wallets";
import { Prisma, type Deposit, type DepositStatus, type User } from "@/generated/prisma/client";

/**
 * Deposits (crypto only; there is no cash balance).
 *
 * The customer picks a coin (and, for USDT, a network), sends it to the
 * platform wallet an admin set for it, then tells us the amount. That records
 * a PENDING deposit which credits nothing. An admin checks the real wallet and
 * either approves it (one balanced entry: EXTERNAL clearing -> user, net of
 * fee + FEES) or rejects it. The customer sees Pending, then Success or Failed.
 */
const TX = { timeout: 20_000, maxWait: 10_000 } as const;
const isProd = process.env.NODE_ENV === "production";

/**
 * Crypto deposits and withdrawals are settled by hand after admin review. Outside
 * production they're labelled sandbox and post to a separate clearing account.
 */
export function cryptoMode(): "live" | "sandbox" {
  return isProd ? "live" : "sandbox";
}

/** What the customer sees for a deposit: never anything but Pending, Success or Failed. */
export function depositOutcome(status: DepositStatus): "PENDING" | "SUCCESS" | "FAILED" {
  return status === "COMPLETED" ? "SUCCESS" : status === "PENDING" ? "PENDING" : "FAILED";
}

async function depositFee(amount: Decimal, decimals: number): Promise<Decimal> {
  const { fees } = await getSettings();
  return amount.mul(fees.depositBps.CRYPTO).div(10_000).toDecimalPlaces(decimals, Prisma.Decimal.ROUND_UP);
}

function newReference() {
  // Human-friendly, unambiguous (no 0/O/1/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return "ORB-" + [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

/** Record a deposit the customer says they've sent. It stays PENDING until an admin decides. */
export async function createDeposit(input: {
  user: User;
  assetCode: string;
  networkId: string;
  amount: string;
  txHash?: string;
}) {
  const { user } = input;
  if (user.kycStatus !== "APPROVED") throw new LedgerError("Verify your identity before depositing.", "INVALID");

  const asset = await db.asset.findFirst({ where: { code: input.assetCode, enabled: true, type: "CRYPTO" } });
  if (!asset) throw new LedgerError("This coin isn't supported.", "NOT_FOUND");
  const network = coinNetworks(asset.code).find((n) => n.id === input.networkId);
  if (!network) throw new LedgerError("Choose a network.", "INVALID");
  const address = (await getDepositWallets())[walletKey(asset.code, network.id)];
  if (!address) throw new LedgerError(`${asset.code} deposits on ${network.label} aren't available yet.`, "INVALID");

  const amount = parseAmount(input.amount, asset.decimals);
  const txHash = input.txHash?.trim().slice(0, 200) || null;
  const account = await ensureDefaultAccount(user.id);
  const fee = await depositFee(amount, asset.decimals);

  let deposit: Deposit;
  try {
    deposit = await db.deposit.create({
      data: {
        userId: user.id,
        accountId: account.id,
        method: "CRYPTO",
        assetCode: asset.code,
        amount,
        fee,
        network: network.label,
        walletAddress: address,
        providerRef: txHash,
        reference: newReference(),
        sandbox: cryptoMode() === "sandbox",
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
      throw new LedgerError("That transaction ID was already submitted.", "DUPLICATE");
    throw err;
  }
  await notify(user.id, {
    type: "ACCOUNT",
    title: "Deposit pending",
    body: `Your deposit of ${amount} ${asset.code} is pending. We'll add it to your balance once it's approved.`,
    link: "/deposit",
  }).catch(() => {});
  return deposit;
}

/** Approve a pending deposit and credit it exactly once (double clicks are harmless). Null if no longer pending. */
export async function completeDeposit(depositId: string) {
  const result = await db.$transaction(async (tx) => {
    // Crypto only: a legacy cash (bank/card/mobile money) deposit can be rejected but never credited.
    const claimed = await tx.deposit.updateMany({
      where: { id: depositId, status: "PENDING", method: "CRYPTO" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (claimed.count !== 1) return null;
    const d = await tx.deposit.findUniqueOrThrow({ where: { id: depositId } });
    const external = await systemLedgerAccount(
      tx,
      d.sandbox ? "SANDBOX_EXTERNAL" : "EXTERNAL_CLEARING",
      d.assetCode,
      true,
    );
    const fees = await systemLedgerAccount(tx, "FEES", d.assetCode);
    const user = await tx.ledgerAccount.upsert({
      where: { accountId_assetCode: { accountId: d.accountId, assetCode: d.assetCode } },
      update: {},
      create: { accountId: d.accountId, assetCode: d.assetCode },
    });
    const entry = await postEntry(tx, {
      type: "DEPOSIT",
      description: `Deposit ${d.amount} ${d.assetCode}${d.network ? ` (${d.network})` : ""}${d.sandbox ? " (sandbox)" : ""}`,
      userId: d.userId,
      idempotencyKey: `deposit:${d.id}`,
      metadata: { depositId: d.id, sandbox: d.sandbox },
      postings: [
        { ledgerAccountId: external.id, assetCode: d.assetCode, amount: d.amount.negated() },
        { ledgerAccountId: user.id, assetCode: d.assetCode, amount: d.amount.minus(d.fee) },
        { ledgerAccountId: fees.id, assetCode: d.assetCode, amount: d.fee },
      ],
    });
    await tx.deposit.update({ where: { id: d.id }, data: { entryId: entry.id } });
    return d;
  }, TX);
  if (result) {
    // A first qualifying deposit may unlock referral bonuses (idempotent).
    await maybeAwardReferral(result.userId).catch((err) => console.error("[referral]", err));
    await notifyDecision(result.userId, {
      kind: "DEPOSIT_APPROVED",
      amount: result.amount.minus(result.fee).toString(),
      assetCode: result.assetCode,
    });
  }
  return result;
}

/** Reject a pending deposit. Nothing was credited, so nothing moves. Null if no longer pending. */
export async function failDeposit(depositId: string, reason?: string) {
  const { count } = await db.deposit.updateMany({
    where: { id: depositId, status: "PENDING" },
    data: { status: "FAILED", failureReason: reason || null },
  });
  if (count !== 1) return null;
  const d = await db.deposit.findUniqueOrThrow({ where: { id: depositId } });
  await notifyDecision(d.userId, {
    kind: "DEPOSIT_REJECTED",
    amount: d.amount.toString(),
    assetCode: d.assetCode,
    reason,
  });
  return d;
}
