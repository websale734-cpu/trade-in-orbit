/** A price snapshot for one coin, shared by server and client code. */
export type Ticker = {
  symbol: string;
  name: string;
  image: string | null;
  priceUsd: number;
  change24hPct: number;
  /** ~7 days of hourly prices, oldest first. Empty when unavailable. */
  sparkline: number[];
  binanceSymbol?: string;
};

export type MarketSnapshot = {
  tickers: Ticker[];
  /** ISO timestamp of when the snapshot was fetched upstream. */
  fetchedAt: string;
  /** Upstream failed and no cached data exists. */
  unavailable: boolean;
};
