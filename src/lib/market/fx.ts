import "server-only";
import { unstable_rethrow } from "next/navigation";

/**
 * USD -> fiat exchange rates for showing balances in local currency.
 *
 * Derived from CoinGecko's /exchange_rates (BTC-denominated, so
 * USD->X = rate[X] / rate[USD]). Cached for 10 minutes; on failure the last
 * good rates are served. Display only; rates here never settle money.
 */
const TTL_MS = 10 * 60_000;
const COINGECKO_BASE = process.env.COINGECKO_API_BASE ?? "https://api.coingecko.com/api/v3";

export type FxRates = { rates: Record<string, number>; fetchedAt: string } | null;

let cache: { data: NonNullable<FxRates>; expires: number } | null = null;
let inflight: Promise<FxRates> | null = null;

export async function getFxRates(): Promise<FxRates> {
  if (cache && cache.expires > Date.now()) return cache.data;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(`${COINGECKO_BASE}/exchange_rates`, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`CoinGecko exchange_rates ${res.status}`);
      const body = (await res.json()) as { rates: Record<string, { value: number; type: string }> };
      const usd = body.rates.usd?.value;
      if (!usd) throw new Error("exchange_rates missing usd");
      const rates: Record<string, number> = {};
      for (const [code, r] of Object.entries(body.rates)) if (r.type === "fiat") rates[code] = r.value / usd;
      const data = { rates, fetchedAt: new Date().toISOString() };
      cache = { data, expires: Date.now() + TTL_MS };
      return data;
    } catch (err) {
      unstable_rethrow(err);
      console.error("[fx] fetch failed:", err instanceof Error ? err.message : err);
      return cache?.data ?? null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
