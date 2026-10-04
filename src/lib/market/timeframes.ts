/**
 * Chart timeframes, shared by the candles API (REST history) and the coin page
 * (which opens the matching Binance kline stream). Each maps to a candle
 * interval, a candle count and how long the server caches that history.
 */
export const TIMEFRAMES = {
  "1D": { interval: "15m", limit: 96, ttl: 30_000 },
  "1W": { interval: "1h", limit: 168, ttl: 60_000 },
  "1M": { interval: "4h", limit: 180, ttl: 300_000 },
  "1Y": { interval: "1d", limit: 365, ttl: 900_000 },
} as const;
export type Timeframe = keyof typeof TIMEFRAMES;
export const TIMEFRAME_KEYS = Object.keys(TIMEFRAMES) as Timeframe[];

export function isTimeframe(v: string): v is Timeframe {
  return v in TIMEFRAMES;
}

/** [openTime ms, open, high, low, close, volume], oldest first. */
export type Ohlc = [number, number, number, number, number, number];

/** Express a pair's candle as 1 / price (e.g. USDT priced from USDC/USDT): high and low swap. */
export function invertOhlc([t, o, h, l, c, v]: Ohlc): Ohlc {
  return [t, 1 / o, 1 / l, 1 / h, 1 / c, v];
}

/** Rolling 24-hour figures for a coin, in USD (USDT) terms. */
export type DayStats = { price: number; open: number; high: number; low: number; quoteVolume: number };

/** Binance 24h fields (REST ticker or miniTicker stream) → DayStats, inverting when needed. */
export function dayStatsFrom(t: { c: number; o: number; h: number; l: number; q: number }, invert: boolean): DayStats {
  return invert
    ? { price: 1 / t.c, open: 1 / t.o, high: 1 / t.l, low: 1 / t.h, quoteVolume: t.q }
    : { price: t.c, open: t.o, high: t.h, low: t.l, quoteVolume: t.q };
}
