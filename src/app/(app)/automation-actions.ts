"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { MAX_ACTIVE_ALERTS, MAX_ACTIVE_RECURRING, MIN_RECURRING_USD, nextOccurrence } from "@/server/automation";
import type { FormState } from "@/components/ui/form";

const num = z.string().trim().regex(/^\d+(\.\d+)?$/, "Enter a valid number.");

/** Only coins that are enabled and tradable can be alerted on or bought. */
async function tradableAsset(code: string) {
  return db.asset.findFirst({ where: { code, enabled: true, tradingEnabled: true, NOT: { code: "USD" } } });
}

// ---------------------------------------------------------------------------
// Price alerts
// ---------------------------------------------------------------------------

export async function createAlert(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const values = {
    assetCode: String(fd.get("assetCode") ?? ""),
    direction: String(fd.get("direction") ?? ""),
    targetPrice: String(fd.get("targetPrice") ?? ""),
  };
  const parsed = z
    .object({ assetCode: z.string().regex(/^[A-Z]{2,6}$/), direction: z.enum(["ABOVE", "BELOW"]), targetPrice: num })
    .safeParse(values);
  if (!parsed.success) return { fieldErrors: { targetPrice: parsed.error.issues[0].message }, values };
  const price = Number(parsed.data.targetPrice);
  if (!(price > 0) || price > 1e12) return { fieldErrors: { targetPrice: "Enter a price above zero." }, values };
  if (!(await tradableAsset(parsed.data.assetCode))) return { error: "That coin isn't available.", values };

  const active = await db.priceAlert.count({ where: { userId: user.id, status: "ACTIVE" } });
  if (active >= MAX_ACTIVE_ALERTS) return { error: `You can have up to ${MAX_ACTIVE_ALERTS} active alerts.`, values };

  await db.priceAlert.create({
    data: { userId: user.id, ...parsed.data, notifyEmail: fd.get("notifyEmail") === "on" },
  });
  revalidatePath("/alerts");
  return {
    message: `We'll let you know when ${parsed.data.assetCode} goes ${parsed.data.direction.toLowerCase()} $${parsed.data.targetPrice}.`,
  };
}

export async function cancelAlert(fd: FormData): Promise<void> {
  const { user } = await requireUser();
  // Scoped to the owner: another user's alert id matches nothing.
  await db.priceAlert.updateMany({
    where: { id: String(fd.get("id") ?? ""), userId: user.id, status: "ACTIVE" },
    data: { status: "CANCELLED" },
  });
  revalidatePath("/alerts");
}

// ---------------------------------------------------------------------------
// Recurring buys
// ---------------------------------------------------------------------------

export async function createRecurring(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const values = {
    assetCode: String(fd.get("assetCode") ?? ""),
    amountUsd: String(fd.get("amountUsd") ?? ""),
    frequency: String(fd.get("frequency") ?? ""),
    accountId: String(fd.get("accountId") ?? ""),
  };
  const parsed = z
    .object({
      assetCode: z.string().regex(/^[A-Z]{2,6}$/),
      amountUsd: num,
      frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
      accountId: z.string().min(1),
    })
    .safeParse(values);
  if (!parsed.success) return { fieldErrors: { amountUsd: parsed.error.issues[0].message }, values };
  const amount = Number(parsed.data.amountUsd);
  if (amount < MIN_RECURRING_USD || amount > 100_000)
    return { fieldErrors: { amountUsd: `Enter between $${MIN_RECURRING_USD} and $100,000.` }, values };
  if (!(await tradableAsset(parsed.data.assetCode))) return { error: "That coin isn't available.", values };

  const account = await db.account.findFirst({
    where: { id: parsed.data.accountId, userId: user.id, archivedAt: null, type: { not: "DEMO" } },
  });
  if (!account) return { error: "Choose one of your accounts.", values };

  const active = await db.recurringBuy.count({ where: { userId: user.id, status: { not: "CANCELLED" } } });
  if (active >= MAX_ACTIVE_RECURRING)
    return { error: `You can have up to ${MAX_ACTIVE_RECURRING} recurring buys.`, values };

  // The first purchase runs on the next background cycle (within a minute).
  await db.recurringBuy.create({
    data: {
      userId: user.id,
      accountId: account.id,
      assetCode: parsed.data.assetCode,
      amountUsd: parsed.data.amountUsd,
      frequency: parsed.data.frequency,
      nextRunAt: new Date(),
    },
  });
  revalidatePath("/recurring");
  return {
    message: `Recurring buy set: $${parsed.data.amountUsd} of ${parsed.data.assetCode} ${parsed.data.frequency.toLowerCase()}. The first purchase happens within a minute.`,
  };
}

export async function updateRecurring(fd: FormData): Promise<void> {
  const { user } = await requireUser();
  const id = String(fd.get("id") ?? "");
  const op = fd.get("op");
  const r = await db.recurringBuy.findFirst({ where: { id, userId: user.id, status: { not: "CANCELLED" } } });
  if (!r) return;
  if (op === "pause" && r.status === "ACTIVE")
    await db.recurringBuy.updateMany({ where: { id, userId: user.id }, data: { status: "PAUSED" } });
  else if (op === "resume" && r.status === "PAUSED") {
    // Don't back-fill buys missed while paused: continue from the next future occurrence.
    let next = r.nextRunAt;
    while (next.getTime() <= Date.now()) next = nextOccurrence(next, r.frequency);
    await db.recurringBuy.updateMany({
      where: { id, userId: user.id },
      data: { status: "ACTIVE", failureCount: 0, nextRunAt: next },
    });
  } else if (op === "cancel")
    await db.recurringBuy.updateMany({ where: { id, userId: user.id }, data: { status: "CANCELLED" } });
  revalidatePath("/recurring");
}
