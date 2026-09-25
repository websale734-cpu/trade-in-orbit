"use client";

import { useMarket } from "./market-provider";
import { CoinIcon } from "./coin-icon";
import { cn, formatPct, formatUsd } from "@/lib/utils";

/**
 * Infinite scrolling price strip. The list is rendered twice and translated by
 * -50% so the loop is seamless. Pauses on hover so users can read a price.
 */
export function PriceTicker() {
  const { tickers, unavailable } = useMarket();
  if (unavailable || tickers.length === 0) return null;

  const row = tickers.map((t) => (
    <div key={t.symbol} className="flex shrink-0 items-center gap-2.5 px-5 py-3">
      <CoinIcon src={t.image} symbol={t.symbol} size={20} />
      <span className="text-sm font-semibold">{t.symbol}</span>
      <span
        key={t.priceUsd}
        className={cn("tabular rounded px-1 text-sm text-muted", t.direction && `flash-${t.direction}`)}
      >
        {formatUsd(t.priceUsd)}
      </span>
      <span className={cn("tabular text-xs font-medium", t.change24hPct >= 0 ? "text-up" : "text-down")}>
        {formatPct(t.change24hPct)}
      </span>
    </div>
  ));

  return (
    <div
      className="group relative overflow-hidden border-y border-line bg-bg-elevated/60 backdrop-blur"
      aria-label="Live prices"
    >
      {/* Edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-bg to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-bg to-transparent" />
      <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]">
        {row}
        <div className="flex" aria-hidden>
          {row}
        </div>
      </div>
    </div>
  );
}
