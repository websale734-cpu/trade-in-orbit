import "server-only";
import { db } from "../db";
import { getMarketSnapshot } from "@/lib/market/coingecko";

/**
 * Admin overview metrics. Crypto amounts are valued in USD at *current*
 * prices (labelled as such in the UI); USD amounts are exact.
 */
export type DailyPoint = { day: string; value: number };

async function usdPrices(): Promise<Record<string, number>> {
  const snap = await getMarketSnapshot();
  return { USD: 1, ...Object.fromEntries(snap.tickers.map((t) => [t.symbol, t.priceUsd])) };
}

function fill30(rows: { day: Date; value: number }[]): DailyPoint[] {
  const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), r.value]));
  const out: DailyPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ day: d, value: byDay.get(d) ?? 0 });
  }
  return out;
}

export async function adminOverview() {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const prices = await usdPrices();

  const [users, newUsers, kycPending, depPending, wdQueue, signups, tradeRows, feeRows, depRows, wdRows] =
    await Promise.all([
      db.user.count({ where: { role: "USER" } }),
      db.user.count({ where: { role: "USER", createdAt: { gte: since } } }),
      db.kycSubmission.count({ where: { status: "PENDING" } }),
      db.deposit.count({ where: { status: "PENDING" } }),
      db.withdrawal.count({ where: { status: { in: ["UNDER_REVIEW", "APPROVED", "SENT"] } } }),
      db.$queryRaw<{ day: Date; value: number }[]>`
      SELECT date_trunc('day', created_at) AS day, count(*)::int AS value
      FROM users WHERE role = 'USER' AND created_at >= ${since} GROUP BY 1`,
      db.$queryRaw<{ day: Date; value: number }[]>`
      SELECT date_trunc('day', filled_at) AS day, sum(quantity * fill_price)::float AS value
      FROM orders WHERE status = 'FILLED' AND demo = false AND filled_at >= ${since} GROUP BY 1`,
      db.$queryRaw<{ asset_code: string; total: number }[]>`
      SELECT p.asset_code, sum(p.amount)::float AS total
      FROM postings p JOIN ledger_accounts la ON la.id = p.ledger_account_id
      WHERE la.system_code = 'FEES' AND p.amount > 0 AND p.created_at >= ${since} GROUP BY 1`,
      db.$queryRaw<{ asset_code: string; total: number }[]>`
      SELECT asset_code, sum(amount)::float AS total FROM deposits
      WHERE status = 'COMPLETED' AND sandbox = false AND completed_at >= ${since} GROUP BY 1`,
      db.$queryRaw<{ asset_code: string; total: number }[]>`
      SELECT asset_code, sum(amount)::float AS total FROM withdrawals
      WHERE status = 'COMPLETED' AND sandbox = false AND completed_at >= ${since} GROUP BY 1`,
    ]);

  const usd = (rows: { asset_code: string; total: number }[]) =>
    rows.reduce((s, r) => s + r.total * (prices[r.asset_code] ?? 0), 0);

  return {
    users,
    newUsers,
    kycPending,
    depPending,
    wdQueue,
    revenue30d: usd(feeRows),
    deposits30d: usd(depRows),
    withdrawals30d: usd(wdRows),
    tradeVolume30d: tradeRows.reduce((s, r) => s + r.value, 0),
    signupsDaily: fill30(signups),
    volumeDaily: fill30(tradeRows),
  };
}
