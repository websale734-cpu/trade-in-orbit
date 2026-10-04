"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/dal";
import { LedgerError } from "@/server/ledger";
import { cancelOrder, executeMarketOrder, executeSwap, placeLimitOrder } from "@/server/trading";
import { PriceUnavailableError } from "@/lib/market/price";
import { QUOTE_ASSET } from "@/config/funding";
import type { FormState } from "@/components/ui/form";

export type TradeState = FormState & { done?: string };

const common = {
  demo: z.enum(["true", "false"]).transform((v) => v === "true"),
  accountId: z
    .string()
    .optional()
    .transform((v) => v || null),
  idempotencyKey: z.string().uuid(),
};
const asset = z.string().regex(/^[A-Z]{2,6}$/);
const num = z.string().regex(/^\d+(\.\d+)?$/, "Enter a valid number.");

function fail(err: unknown): TradeState {
  if (err instanceof LedgerError)
    return { error: err.code === "DUPLICATE" ? "This order was already placed." : err.message };
  if (err instanceof PriceUnavailableError) return { error: err.message };
  console.error("[trade]", err);
  return { error: "The order couldn't be completed. No funds were moved." };
}

function done(message: string): TradeState {
  revalidatePath("/trade");
  revalidatePath("/dashboard");
  return { message, done: crypto.randomUUID() };
}

export async function marketOrder(_prev: TradeState | undefined, fd: FormData): Promise<TradeState> {
  const { user } = await requireUser();
  const parsed = z
    .object({ ...common, side: z.enum(["BUY", "SELL"]), base: asset, amount: num, expectedPrice: num.optional() })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const r = await executeMarketOrder({ userId: user.id, ...parsed.data });
    const verb = parsed.data.side === "BUY" ? "Bought" : "Sold";
    return done(
      `${verb} ${r!.qty} ${parsed.data.base} at ${r!.price.toFixed(2)} ${QUOTE_ASSET}. Fee ${r!.fee.toFixed(2)} ${QUOTE_ASSET}.`,
    );
  } catch (err) {
    return fail(err);
  }
}

export async function swapOrder(_prev: TradeState | undefined, fd: FormData): Promise<TradeState> {
  const { user } = await requireUser();
  const parsed = z
    .object({ ...common, from: asset, to: asset, quantity: num, expectedRate: num.optional() })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const r = await executeSwap({ userId: user.id, ...parsed.data });
    return done(`Swapped ${parsed.data.quantity} ${parsed.data.from} for ${r!.received} ${parsed.data.to}.`);
  } catch (err) {
    return fail(err);
  }
}

export async function limitOrder(_prev: TradeState | undefined, fd: FormData): Promise<TradeState> {
  const { user } = await requireUser();
  const parsed = z
    .object({ ...common, side: z.enum(["BUY", "SELL"]), base: asset, quantity: num, limitPrice: num })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await placeLimitOrder({ userId: user.id, ...parsed.data });
    return done(
      `Limit ${parsed.data.side.toLowerCase()} for ${parsed.data.quantity} ${parsed.data.base} at ${parsed.data.limitPrice} ${QUOTE_ASSET} placed. Funds are reserved until it fills or you cancel.`,
    );
  } catch (err) {
    return fail(err);
  }
}

/** Single entry point for the order ticket; dispatches on the hidden `kind` field. */
export async function submitTrade(prev: TradeState | undefined, fd: FormData): Promise<TradeState> {
  const kind = fd.get("kind");
  if (kind === "swap") return swapOrder(prev, fd);
  if (kind === "limit") return limitOrder(prev, fd);
  return marketOrder(prev, fd);
}

export async function cancelLimitOrder(fd: FormData): Promise<void> {
  const { user } = await requireUser();
  await cancelOrder(user.id, String(fd.get("orderId") ?? "")).catch(() => {});
  revalidatePath("/trade");
}
