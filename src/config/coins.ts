/**
 * Coins tracked on public pages.
 *
 * `coingeckoId` is used for REST snapshots (price, 24h change, 7-day sparkline);
 * `binanceSymbol` is used for the real-time WebSocket stream. Stablecoins such as
 * USDT have no USDT-quoted pair on Binance, so they update from the REST snapshot only.
 *
 * From Phase 5 the enabled coin list is managed in the admin panel; this list
 * then seeds the database.
 */
export type TrackedCoin = {
  symbol: string;
  name: string;
  coingeckoId: string;
  binanceSymbol?: string;
  /**
   * Binance pair used for the coin page's candlestick chart when the coin has no
   * USDT pair of its own. `invert` charts 1 / price (USDT from USDC/USDT).
   */
  chartPair?: { symbol: string; invert: boolean };
};

export const trackedCoins: TrackedCoin[] = [
  { symbol: "BTC", name: "Bitcoin", coingeckoId: "bitcoin", binanceSymbol: "BTCUSDT" },
  { symbol: "ETH", name: "Ethereum", coingeckoId: "ethereum", binanceSymbol: "ETHUSDT" },
  { symbol: "SOL", name: "Solana", coingeckoId: "solana", binanceSymbol: "SOLUSDT" },
  { symbol: "USDT", name: "Tether", coingeckoId: "tether", chartPair: { symbol: "USDCUSDT", invert: true } },
  { symbol: "BNB", name: "BNB", coingeckoId: "binancecoin", binanceSymbol: "BNBUSDT" },
  { symbol: "XRP", name: "XRP", coingeckoId: "ripple", binanceSymbol: "XRPUSDT" },
  { symbol: "ADA", name: "Cardano", coingeckoId: "cardano", binanceSymbol: "ADAUSDT" },
  { symbol: "DOGE", name: "Dogecoin", coingeckoId: "dogecoin", binanceSymbol: "DOGEUSDT" },
  { symbol: "AVAX", name: "Avalanche", coingeckoId: "avalanche-2", binanceSymbol: "AVAXUSDT" },
  { symbol: "TRX", name: "TRON", coingeckoId: "tron", binanceSymbol: "TRXUSDT" },
  { symbol: "LINK", name: "Chainlink", coingeckoId: "chainlink", binanceSymbol: "LINKUSDT" },
  { symbol: "DOT", name: "Polkadot", coingeckoId: "polkadot", binanceSymbol: "DOTUSDT" },
];

/** The Binance pair behind a coin's candlestick chart, or null if it can't be charted. */
export function chartPairOf(code: string): { symbol: string; invert: boolean } | null {
  const coin = trackedCoins.find((c) => c.symbol === code);
  if (!coin) return null;
  if (coin.binanceSymbol) return { symbol: coin.binanceSymbol, invert: false };
  return coin.chartPair ?? null;
}
