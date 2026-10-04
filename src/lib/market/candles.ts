import "server-only";
import { chartPairOf, trackedCoins } from "@/config/coins";
import { TIMEFRAMES, dayStatsFrom, invertOhlc, type DayStats, type Ohlc, type Timeframe } from "./timeframes";

export { TIMEFRAMES, isTimeframe, type Timeframe } from "./timeframes";

/**
 * Price history for charts, from Binance's public market-data API (no key).
 * Each timeframe maps to a candle interval and count, cached briefly per
 * pair so many viewers share one upstream request. Coins without a USDT pair
 * of their own (USDT) are charted from an inverted pair (USDC/USDT).
 */

/** [openTime ms, close price] pairs, oldest first. */
export type Candle = [number, number];

const BASE = process.env.BINANCE_REST_URL ?? "https://data-api.binance.vision";
const cache = new Map<string, { data: Ohlc[]; expires: number }>();

/** The coin's own USDT pair (order book, line chart); null for coins without one. */
export function chartableSymbol(assetCode: string): string | null {
  return trackedCoins.find((c) => c.symbol === assetCode)?.binanceSymbol ?? null;
}

/** Full candles (open, high, low, close, volume) for the coin page's candlestick chart. */
export async function getOhlc(assetCode: string, tf: Timeframe): Promise<Ohlc[] | null> {
  const pair = chartPairOf(assetCode);
  if (!pair) return null;
  const key = `${pair.symbol}:${tf}`;
  const hit = cache.get(key);
  const fresh = hit && hit.expires > Date.now() ? hit.data : null;

  let rows = fresh;
  if (!rows) {
    const { interval, limit, ttl } = TIMEFRAMES[tf];
    try {
      const res = await fetch(`${BASE}/api/v3/klines?symbol=${pair.symbol}&interval=${interval}&limit=${limit}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`Binance klines ${res.status}`);
      // Kline row: [openTime, open, high, low, close, volume, closeTime, ...]
      const raw = (await res.json()) as [number, string, string, string, string, string][];
      rows = raw.map((r) => [r[0], Number(r[1]), Number(r[2]), Number(r[3]), Number(r[4]), Number(r[5])]);
      cache.set(key, { data: rows, expires: Date.now() + ttl });
    } catch (err) {
      console.error("[candles]", key, err instanceof Error ? err.message : err);
      rows = hit?.data ?? null; // stale beats nothing
    }
  }
  if (!rows) return null;
  return pair.invert ? rows.map(invertOhlc) : rows;
}

/** Close prices only, for the dashboard line chart. */
export async function getCandles(assetCode: string, tf: Timeframe): Promise<Candle[] | null> {
  const rows = await getOhlc(assetCode, tf);
  return rows ? rows.map((r) => [r[0], r[4]]) : null;
}

const dayCache = new Map<string, { data: DayStats; expires: number }>();

/** 24h price, open, high, low and traded value, so the coin page renders them before its stream connects. */
export async function getDayStats(assetCode: string): Promise<DayStats | null> {
  const pair = chartPairOf(assetCode);
  if (!pair) return null;
  const hit = dayCache.get(pair.symbol);
  if (hit && hit.expires > Date.now()) return hit.data;
  try {
    const res = await fetch(`${BASE}/api/v3/ticker/24hr?symbol=${pair.symbol}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`Binance 24hr ${res.status}`);
    const t = (await res.json()) as Record<string, string>;
    const data = dayStatsFrom(
      {
        c: Number(t.lastPrice),
        o: Number(t.openPrice),
        h: Number(t.highPrice),
        l: Number(t.lowPrice),
        q: Number(t.quoteVolume),
      },
      pair.invert,
    );
    dayCache.set(pair.symbol, { data, expires: Date.now() + 15_000 });
    return data;
  } catch (err) {
    console.error("[24hr]", pair.symbol, err instanceof Error ? err.message : err);
    return hit?.data ?? null;
  }
}
