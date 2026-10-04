import "server-only";
import { chartPairOf, trackedCoins } from "@/config/coins";
import { QUOTE_ASSET } from "@/config/funding";
import { getDayStats } from "@/lib/market/candles";
import type { CoinTrading } from "@/components/coin/coin-view";
import { db } from "./db";

/**
 * Everything a coin page needs, or null when the symbol isn't a supported,
 * enabled coin. Buy/Sell is offered only while the coin's trading pair is open
 * (the same rule the Trade page applies); USDT, the quote coin, is swapped.
 */
export async function loadCoinPage(symbol: string) {
  const code = symbol.toUpperCase();
  const coin = trackedCoins.find((c) => c.symbol === code);
  const pair = chartPairOf(code);
  if (!coin || !pair) return null;

  const [asset, stats] = await Promise.all([
    db.asset.findUnique({ where: { code }, select: { enabled: true, tradingEnabled: true, type: true } }),
    getDayStats(code),
  ]);
  if (asset && !asset.enabled) return null;

  const trading: CoinTrading =
    code === QUOTE_ASSET ? "quote" : asset?.tradingEnabled && asset.type === "CRYPTO" ? "open" : "paused";
  return { code, name: coin.name, pair: pair.symbol, invert: pair.invert, stats, trading };
}
