import { timingSafeEqual } from "node:crypto";
import { matchOpenOrders } from "@/server/trading";
import { processScheduledWithdrawals } from "@/server/withdrawals";

/**
 * GET /api/cron/process
 * Background jobs: fill limit orders whose price has been reached, and release
 * scheduled withdrawals into review. Call every minute from a scheduler
 * (Vercel Cron, a Neon Function Trigger, GitHub Actions, ...) with
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret)))
    return new Response("Unauthorized", { status: 401 });

  const [filled, released] = await Promise.all([matchOpenOrders(), processScheduledWithdrawals()]);
  return Response.json({ ok: true, ordersFilled: filled, withdrawalsReleased: released, at: new Date().toISOString() });
}
