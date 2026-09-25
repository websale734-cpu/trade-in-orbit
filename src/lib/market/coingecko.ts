import "server-only";
import { unstable_rethrow } from "next/navigation";
import { trackedCoins } from "@/config/coins";
import type { MarketSnapshot, Ticker } from "./types";

/**
 * CoinGecko market snapshot with an in-memory cache.
 *
 * The free CoinGecko tier is rate limited, so we fetch at most once per TTL per
 * server instance and share the result across requests. Concurrent callers wait
 * on the same in-flight request. If CoinGecko fails we keep serving the last good
 * snapshot; with no snapshot at all we report `unavailable` rather than showing
 * made-up prices.
 */
const TTL_MS = 60_000;
const COINGECKO_BASE = process.env.COINGECKO_API_BASE ?? "https://api.coingecko.com/api/v3";

let cache: { data: MarketSnapshot; expires: number } | null = null;
let inflight: Promise<MarketSnapshot> | null = null;

type CoinGeckoMarket = {
  id: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number | null;
  sparkline_in_7d?: { price: number[] };
};

async function fetchFromCoinGecko(): Promise<MarketSnapshot> {
  const ids = trackedCoins.map((c) => c.coingeckoId).join(",");
  const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${ids}&sparkline=true&price_change_percentage=24h`;

  const headers: Record<string, string> = { accept: "application/json" };
  // Optional key: demo keys use x-cg-demo-api-key, pro keys use x-cg-pro-api-key.
  const key = process.env.COINGECKO_API_KEY;
  if (key) headers[process.env.COINGECKO_API_PLAN === "pro" ? "x-cg-pro-api-key" : "x-cg-demo-api-key"] = key;

  const res = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`CoinGecko responded ${res.status}`);
  const rows = (await res.json()) as CoinGeckoMarket[];
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Keep our configured order and skip anything CoinGecko didn't return.
  const tickers: Ticker[] = trackedCoins.flatMap((coin) => {
    const row = byId.get(coin.coingeckoId);
    if (!row) return [];
    return [
      {
        symbol: coin.symbol,
        name: coin.name,
        image: row.image ?? null,
        priceUsd: row.current_price,
        change24hPct: row.price_change_percentage_24h ?? 0,
        sparkline: downsample(row.sparkline_in_7d?.price ?? [], 84),
        binanceSymbol: coin.binanceSymbol,
      },
    ];
  });

  return { tickers, fetchedAt: new Date().toISOString(), unavailable: tickers.length === 0 };
}

/** Get the latest market snapshot (cached for TTL_MS). Never throws. */
export async function getMarketSnapshot(): Promise<MarketSnapshot> {
  if (cache && cache.expires > Date.now()) return cache.data;
  if (inflight) return inflight;

  inflight = fetchFromCoinGecko()
    .then((data) => {
      cache = { data, expires: Date.now() + TTL_MS };
      return data;
    })
    .catch((err) => {
      // Let Next.js internal control-flow errors (e.g. dynamic-rendering signals) propagate.
      unstable_rethrow(err);
      console.error("[market] CoinGecko fetch failed:", err instanceof Error ? err.message : err);
      // Serve stale data if we have it; retry sooner than a full TTL.
      if (cache) {
        cache.expires = Date.now() + 15_000;
        return cache.data;
      }
      return { tickers: [], fetchedAt: new Date().toISOString(), unavailable: true };
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Reduce a series to at most `max` points to keep payloads and SVG paths small. */
function downsample(series: number[], max: number): number[] {
  if (series.length <= max) return series;
  const step = series.length / max;
  const out: number[] = [];
  for (let i = 0; i < max; i++) out.push(series[Math.floor(i * step)]);
  out[out.length - 1] = series[series.length - 1];
  return out;
}
