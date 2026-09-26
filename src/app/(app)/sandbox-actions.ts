"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { completeDeposit, failDeposit, getDepositAddress } from "@/server/funding";
import { advanceWithdrawal, rejectWithdrawal } from "@/server/withdrawals";
import { Decimal } from "@/server/ledger";

/**
 * DEVELOPMENT-ONLY sandbox controls. They simulate what a payment provider
 * webhook or an admin would do, so the flows can be tested end to end before
 * real providers and the admin panel (Phase 5) exist.
 *
 * Every action refuses to run in production, and only touches sandbox records
 * that belong to the signed-in user.
 */
function assertSandbox() {
  if (process.env.NODE_ENV === "production") throw new Error("Sandbox tools are disabled in production.");
}

export async function sandboxConfirmDeposit(fd: FormData) {
  assertSandbox();
  const { user } = await requireUser();
  const d = await db.deposit.findFirst({ where: { id: String(fd.get("id")), userId: user.id, sandbox: true } });
  if (d) await completeDeposit(d.id, `sandbox-${d.id}`);
  revalidatePath("/deposit");
}

export async function sandboxFailDeposit(fd: FormData) {
  assertSandbox();
  const { user } = await requireUser();
  const d = await db.deposit.findFirst({ where: { id: String(fd.get("id")), userId: user.id, sandbox: true } });
  if (d) await failDeposit(d.id, "Simulated provider failure (sandbox).");
  revalidatePath("/deposit");
}

/** Simulate an incoming on-chain deposit to the user's sandbox address. */
export async function sandboxCryptoDeposit(fd: FormData) {
  assertSandbox();
  const { user } = await requireUser();
  const assetCode = String(fd.get("asset"));
  const amount = new Decimal(String(fd.get("amount") || "0"));
  if (amount.lte(0) || user.kycStatus !== "APPROVED") return;
  const addr = await getDepositAddress(user.id, assetCode);
  const account = await db.account.findFirst({ where: { userId: user.id, isDefault: true } });
  if (!addr?.sandbox || !account) return;
  const deposit = await db.deposit.create({
    data: {
      userId: user.id,
      accountId: account.id,
      method: "CRYPTO",
      assetCode,
      amount,
      fee: new Decimal(0),
      reference: `ORB-SBX${Date.now().toString(36).toUpperCase()}`,
      sandbox: true,
    },
  });
  await completeDeposit(deposit.id, `sandbox-tx-${deposit.id}`);
  revalidatePath("/deposit");
}

export async function sandboxAdvanceWithdrawal(fd: FormData) {
  assertSandbox();
  const { user } = await requireUser();
  const w = await db.withdrawal.findFirst({ where: { id: String(fd.get("id")), userId: user.id, sandbox: true } });
  if (w) await advanceWithdrawal(w.id, w.status === "APPROVED" ? `sandbox-tx-${w.id.slice(-8)}` : undefined);
  revalidatePath("/withdraw");
}

export async function sandboxRejectWithdrawal(fd: FormData) {
  assertSandbox();
  const { user } = await requireUser();
  const w = await db.withdrawal.findFirst({ where: { id: String(fd.get("id")), userId: user.id, sandbox: true } });
  if (w) await rejectWithdrawal(w.id, "Simulated compliance rejection (sandbox)");
  revalidatePath("/withdraw");
}
