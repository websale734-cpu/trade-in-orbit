"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { LedgerError, MAX_ACCOUNTS_PER_USER, transferBetweenAccounts } from "@/server/ledger";
import { notify } from "@/server/notify/notifications";
import type { FormState } from "@/components/ui/form";

const openSchema = z.object({
  name: z.string().trim().min(2, "Use at least 2 characters.").max(40, "Use at most 40 characters."),
  type: z.enum(["TRADING", "SAVINGS"]),
});

export async function openAccount(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const parsed = openSchema.safeParse({ name: fd.get("name"), type: fd.get("type") });
  const values = { name: String(fd.get("name") ?? ""), type: String(fd.get("type") ?? "") };
  if (!parsed.success) return { fieldErrors: { name: parsed.error.issues[0].message }, values };

  const count = await db.account.count({ where: { userId: user.id, archivedAt: null } });
  if (count >= MAX_ACCOUNTS_PER_USER) return { error: `You can have up to ${MAX_ACCOUNTS_PER_USER} accounts.`, values };

  try {
    await db.account.create({ data: { userId: user.id, name: parsed.data.name, type: parsed.data.type } });
  } catch {
    return { fieldErrors: { name: "You already have an account with this name." }, values };
  }
  await notify(user.id, {
    type: "ACCOUNT",
    title: "New account opened",
    body: `Your ${parsed.data.name} account is ready.`,
    link: "/accounts",
  }).catch(() => {});
  revalidatePath("/accounts");
  return { message: `${parsed.data.name} account opened.` };
}

const transferSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  assetCode: z.string().regex(/^[A-Z]{2,6}$/),
  amount: z.string().min(1, "Enter an amount."),
  idempotencyKey: z.string().uuid(),
});

export type TransferState = FormState & { done?: string };

export async function transfer(_prev: TransferState | undefined, fd: FormData): Promise<TransferState> {
  const { user } = await requireUser();
  const parsed = transferSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    const entry = await transferBetweenAccounts({ userId: user.id, ...parsed.data });
    const [from, to] = await Promise.all([
      db.account.findUnique({ where: { id: parsed.data.fromAccountId }, select: { name: true } }),
      db.account.findUnique({ where: { id: parsed.data.toAccountId }, select: { name: true } }),
    ]);
    const summary = `${parsed.data.amount} ${parsed.data.assetCode} moved from ${from?.name} to ${to?.name}.`;
    await notify(user.id, { type: "TRANSFER", title: "Transfer complete", body: summary, link: "/accounts" }).catch(
      () => {},
    );
    revalidatePath("/accounts");
    revalidatePath("/dashboard");
    return { message: summary, done: entry?.id };
  } catch (err) {
    if (err instanceof LedgerError) {
      // A retried submission of an already-completed transfer is a success, not an error.
      if (err.code === "DUPLICATE") return { message: "Transfer already completed." };
      return { error: err.message, values: { amount: parsed.data.amount } };
    }
    console.error("[transfer]", err);
    return { error: "The transfer couldn't be completed. No funds were moved." };
  }
}
