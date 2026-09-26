import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { trackedCoins } from "@/config/coins";
import { getMarketSnapshot } from "./coingecko";

/**
 * Server-side execution prices. Trades are always priced here, never from a
 * price the browser sends (the browser's price is only used as a slippage bound).
 *
 * Coins with a Binance pair use Binance's latest trade price (cached 5 s);
 * others (USDT) fall back to the CoinGecko snapshot. USD is 1.
 */
const BASE = process.env.BINANCE_REST_URL ?? "https://data-api.binance.vision";
const TTL_MS = 5_000;
const cache = new Map<string, { price: Prisma.Decimal; expires: number }>();

export class PriceUnavailableError extends Error {
  constructor(asset: string) {
    super(`Live price for ${asset} is unavailable right now. Please try again shortly.`);
  }
}

export async function getLivePrice(assetCode: string): Promise<Prisma.Decimal> {
  if (assetCode === "USD") return new Prisma.Decimal(1);
  const hit = cache.get(assetCode);
  if (hit && hit.expires > Date.now()) return hit.price;

  const symbol = trackedCoins.find((c) => c.symbol === assetCode)?.binanceSymbol;
  let price: Prisma.Decimal | null = null;
  if (symbol) {
    try {
      const res = await fetch(`${BASE}/api/v3/ticker/price?symbol=${symbol}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) price = new Prisma.Decimal(((await res.json()) as { price: string }).price);
    } catch {
      /* fall through to snapshot */
    }
  }
  if (!price) {
    const t = (await getMarketSnapshot()).tickers.find((x) => x.symbol === assetCode);
    if (t) price = new Prisma.Decimal(t.priceUsd);
  }
  if (!price || price.lte(0)) throw new PriceUnavailableError(assetCode);
  cache.set(assetCode, { price, expires: Date.now() + TTL_MS });
  return price;
}
