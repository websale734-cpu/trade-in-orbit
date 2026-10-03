"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/dal";
import { LedgerError } from "@/server/ledger";
import { executeSwap } from "@/server/trading";
import { PriceUnavailableError } from "@/lib/market/price";
import { formatQty } from "@/lib/assets";
import type { FormState } from "@/components/ui/form";

export type ConvertState = FormState & { done?: string };

const asset = z.string().regex(/^[A-Z]{2,6}$/);
const num = z.string().regex(/^\d+(\.\d+)?$/, "Enter a valid amount.");

const schema = z.object({
  accountId: z.string().min(1),
  from: asset,
  to: asset,
  quantity: num,
  expectedRate: num.optional(),
  idempotencyKey: z.string().uuid(),
});

/** Convert one asset into another in a real account (the swap engine prices it server-side). */
export async function convert(_prev: ConvertState | undefined, fd: FormData): Promise<ConvertState> {
  const { user } = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { from, to, quantity } = parsed.data;

  try {
    const r = await executeSwap({ userId: user.id, demo: false, ...parsed.data });
    revalidatePath("/accounts", "layout");
    revalidatePath("/convert");
    revalidatePath("/dashboard");
    return {
      message: `You converted ${formatQty(quantity)} ${from} into ${formatQty(r!.received.toString())} ${to}.`,
      done: r!.entryId,
    };
  } catch (err) {
    if (err instanceof LedgerError) {
      // A retried submission of a conversion that already went through is a success, not an error.
      if (err.code === "DUPLICATE") return { message: "This conversion was already completed.", done: parsed.data.idempotencyKey };
      return { error: err.message };
    }
    if (err instanceof PriceUnavailableError) return { error: err.message };
    console.error("[convert]", err);
    return { error: "The conversion couldn't be completed. Nothing was changed." };
  }
}
