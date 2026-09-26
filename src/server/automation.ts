import "server-only";
import { db } from "./db";
import { Decimal, LedgerError } from "./ledger";
import { executeMarketOrder } from "./trading";
import { notify } from "./notify/notifications";
import { sendEmail, priceAlertEmail } from "./notify/email";
import { getLivePrice, PriceUnavailableError } from "@/lib/market/price";
import type { Frequency } from "@/generated/prisma/client";

/**
 * Price alerts and recurring buys. Both are driven by the background job
 * (GET /api/cron/process), which should run every minute.
 */

export const MAX_ACTIVE_ALERTS = 20;
export const MAX_ACTIVE_RECURRING = 10;
export const MIN_RECURRING_USD = 10;

// ---------------------------------------------------------------------------
// Price alerts
// ---------------------------------------------------------------------------

/** Trigger every active alert whose target has been reached. Each alert fires once. */
export async function checkPriceAlerts(): Promise<number> {
  const active = await db.priceAlert.findMany({ where: { status: "ACTIVE" }, include: { user: { select: { email: true } } }, take: 2000 });
  const assets = [...new Set(active.map((a) => a.assetCode))];
  const prices = new Map<string, Decimal>();
  for (const code of assets) {
    try {
      prices.set(code, await getLivePrice(code));
    } catch {
      /* skip this asset this round */
    }
  }

  let fired = 0;
  for (const a of active) {
    const price = prices.get(a.assetCode);
    if (!price) continue;
    const hit = a.direction === "ABOVE" ? price.gte(a.targetPrice) : price.lte(a.targetPrice);
    if (!hit) continue;
    // Claim it first, so overlapping job runs can't notify twice.
    const { count } = await db.priceAlert.updateMany({
      where: { id: a.id, status: "ACTIVE" },
      data: { status: "TRIGGERED", triggeredAt: new Date(), triggeredPrice: price },
    });
    if (count !== 1) continue;
    fired++;
    const body = `${a.assetCode} is now $${price.toFixed(price.gte(1) ? 2 : 6)}, ${a.direction === "ABOVE" ? "above" : "below"} your target of $${a.targetPrice}.`;
    await notify(a.userId, { type: "SYSTEM", title: `${a.assetCode} price alert`, body, link: `/trade?side=buy` }).catch(() => {});
    if (a.notifyEmail) await sendEmail(priceAlertEmail(a.user.email, a.assetCode, body)).catch(() => {});
  }
  return fired;
}

// ---------------------------------------------------------------------------
// Recurring buys
// ---------------------------------------------------------------------------

export function nextOccurrence(from: Date, frequency: Frequency): Date {
  const d = new Date(from);
  if (frequency === "DAILY") d.setUTCDate(d.getUTCDate() + 1);
  else if (frequency === "WEEKLY") d.setUTCDate(d.getUTCDate() + 7);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/**
 * Execute due recurring buys. Each run uses an idempotency key derived from
 * the schedule and its due time, so a retried job can't buy twice. Failures
 * (e.g. insufficient USD) are recorded and notified; three in a row pause the
 * schedule.
 */
export async function processRecurringBuys(): Promise<{ executed: number; failed: number }> {
  const due = await db.recurringBuy.findMany({ where: { status: "ACTIVE", nextRunAt: { lte: new Date() } }, take: 200 });
  let executed = 0;
  let failed = 0;
  for (const r of due) {
    // Skip missed runs after downtime: schedule the next future occurrence, don't back-fill.
    let next = nextOccurrence(r.nextRunAt, r.frequency);
    while (next.getTime() <= Date.now()) next = nextOccurrence(next, r.frequency);

    // Claim this occurrence (advance nextRunAt) before trading, so concurrent runs skip it.
    const { count } = await db.recurringBuy.updateMany({
      where: { id: r.id, status: "ACTIVE", nextRunAt: r.nextRunAt },
      data: { nextRunAt: next, lastRunAt: new Date() },
    });
    if (count !== 1) continue;

    try {
      const res = await executeMarketOrder({
        userId: r.userId,
        accountId: r.accountId,
        demo: false,
        side: "BUY",
        base: r.assetCode,
        amount: r.amountUsd.toString(),
        idempotencyKey: `recurring:${r.id}:${r.nextRunAt.toISOString()}`,
      });
      await db.recurringBuy.update({
        where: { id: r.id },
        data: { failureCount: 0, lastResult: `Bought ${res!.qty} ${r.assetCode} at $${res!.price.toFixed(2)}` },
      });
      executed++;
    } catch (err) {
      failed++;
      const reason = err instanceof LedgerError || err instanceof PriceUnavailableError ? err.message : "Unexpected error";
      const failures = r.failureCount + 1;
      await db.recurringBuy.update({
        where: { id: r.id },
        data: { failureCount: failures, lastResult: `Failed: ${reason}`, ...(failures >= 3 ? { status: "PAUSED" } : {}) },
      });
      await notify(r.userId, {
        type: "ACCOUNT",
        title: failures >= 3 ? "Recurring buy paused" : "Recurring buy failed",
        body: `Your $${r.amountUsd} ${r.assetCode} recurring buy didn't go through: ${reason}${failures >= 3 ? " It's paused after 3 failed attempts." : ""}`,
        link: "/recurring",
      }).catch(() => {});
    }
  }
  return { executed, failed };
}
