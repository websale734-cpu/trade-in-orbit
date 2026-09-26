import { timingSafeEqual } from "node:crypto";
import { matchOpenOrders } from "@/server/trading";
import { processScheduledWithdrawals } from "@/server/withdrawals";
import { checkPriceAlerts, processRecurringBuys } from "@/server/automation";
import { sendMonthlyStatementNotices } from "@/server/statements";

/**
 * GET /api/cron/process
 * Background jobs, safe to run concurrently or retry (every job claims its
 * work atomically):
 *   - fill limit orders whose price has been reached
 *   - release scheduled withdrawals into review
 *   - trigger price alerts
 *   - execute due recurring buys
 *   - on the 1st of the month, notify customers that last month's statement is ready
 * Call every minute from a scheduler with `Authorization: Bearer $CRON_SECRET`.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret)))
    return new Response("Unauthorized", { status: 401 });

  const run = async <T,>(name: string, fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (err) {
      console.error(`[cron] ${name} failed:`, err);
      return { error: true };
    }
  };
  const [ordersFilled, withdrawalsReleased, alertsTriggered, recurring, statements] = await Promise.all([
    run("orders", matchOpenOrders),
    run("withdrawals", processScheduledWithdrawals),
    run("alerts", checkPriceAlerts),
    run("recurring", processRecurringBuys),
    run("statements", sendMonthlyStatementNotices),
  ]);
  return Response.json({ ok: true, ordersFilled, withdrawalsReleased, alertsTriggered, recurring, statements, at: new Date().toISOString() });
}
