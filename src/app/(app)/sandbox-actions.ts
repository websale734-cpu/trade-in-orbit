"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { approveWithdrawal, rejectWithdrawal } from "@/server/withdrawals";

/**
 * DEVELOPMENT-ONLY sandbox controls. They simulate what an admin would do, so
 * the withdrawal flow can be tested end to end from the customer's side.
 * (Deposits are approved from the admin panel.)
 *
 * Every action refuses to run in production, and only touches sandbox records
 * that belong to the signed-in user.
 */
function assertSandbox() {
  if (process.env.NODE_ENV === "production") throw new Error("Sandbox tools are disabled in production.");
}

export async function sandboxAdvanceWithdrawal(fd: FormData) {
  assertSandbox();
  const { user } = await requireUser();
  const w = await db.withdrawal.findFirst({ where: { id: String(fd.get("id")), userId: user.id, sandbox: true } });
  if (w) await approveWithdrawal(w.id);
  revalidatePath("/withdraw");
}

export async function sandboxRejectWithdrawal(fd: FormData) {
  assertSandbox();
  const { user } = await requireUser();
  const w = await db.withdrawal.findFirst({ where: { id: String(fd.get("id")), userId: user.id, sandbox: true } });
  if (w) await rejectWithdrawal(w.id, "Simulated compliance rejection (sandbox)");
  revalidatePath("/withdraw");
}
