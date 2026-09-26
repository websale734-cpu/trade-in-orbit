import "server-only";
import { trackedCoins } from "@/config/coins";

/**
 * Price history for charts, from Binance's public market-data API (no key).
 * Each timeframe maps to a candle interval and count, cached briefly per
 * symbol so many viewers share one upstream request.
 */
export const TIMEFRAMES = {
  "1D": { interval: "15m", limit: 96, ttl: 30_000 },
  "1W": { interval: "1h", limit: 168, ttl: 60_000 },
  "1M": { interval: "4h", limit: 180, ttl: 300_000 },
  "1Y": { interval: "1d", limit: 365, ttl: 900_000 },
} as const;
export type Timeframe = keyof typeof TIMEFRAMES;

export function isTimeframe(v: string): v is Timeframe {
  return v in TIMEFRAMES;
}

/** [openTime ms, close price] pairs, oldest first. */
export type Candle = [number, number];

const BASE = process.env.BINANCE_REST_URL ?? "https://data-api.binance.vision";
const cache = new Map<string, { data: Candle[]; expires: number }>();

export function chartableSymbol(assetCode: string): string | null {
  return trackedCoins.find((c) => c.symbol === assetCode)?.binanceSymbol ?? null;
}

export async function getCandles(assetCode: string, tf: Timeframe): Promise<Candle[] | null> {
  const symbol = chartableSymbol(assetCode);
  if (!symbol) return null;
  const key = `${symbol}:${tf}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;

  const { interval, limit, ttl } = TIMEFRAMES[tf];
  try {
    const res = await fetch(`${BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Binance klines ${res.status}`);
    // Kline row: [openTime, open, high, low, close, volume, closeTime, ...]
    const rows = (await res.json()) as [number, string, string, string, string][];
    const data: Candle[] = rows.map((r) => [r[0], Number(r[4])]);
    cache.set(key, { data, expires: Date.now() + ttl });
    return data;
  } catch (err) {
    console.error("[candles]", key, err instanceof Error ? err.message : err);
    return hit?.data ?? null; // stale beats nothing
  }
}
