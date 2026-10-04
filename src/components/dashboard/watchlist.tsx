"use client";

import Link from "next/link";
import { Star } from "lucide-react";
import { useMarket } from "@/components/market/market-provider";
import { CoinIcon } from "@/components/market/coin-icon";
import { Sparkline } from "@/components/market/sparkline";
import { StarButton } from "@/components/markets/star-button";
import { cn, formatPct, formatUsd } from "@/lib/utils";

/** The user's favourite coins with live prices and 7-day sparklines. */
export function Watchlist({
  codes,
  labels,
}: {
  codes: string[];
  labels: { title: string; empty: string; browse: string };
}) {
  const { tickers } = useMarket();
  const rows = codes.map((c) => tickers.find((t) => t.symbol === c)).filter((t) => !!t);

  return (
    <section className="glass h-full rounded-[var(--radius-card)] p-5 sm:p-6" aria-label={labels.title}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{labels.title}</h2>
        <Link href="/markets" className="text-sm font-medium text-accent hover:underline">
          {labels.browse}
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-muted">
          <Star className="h-6 w-6 text-subtle" />
          {labels.empty}
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {rows.map((t) => (
            <li
              key={t.symbol}
              className="relative -mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors focus-within:bg-surface hover:bg-surface"
            >
              <CoinIcon src={t.image} symbol={t.symbol} size={28} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/markets/${t.symbol}`}
                  className="text-sm font-semibold outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-accent"
                >
                  {t.symbol}
                </Link>
                <div className="truncate text-xs text-muted">{t.name}</div>
              </div>
              <Sparkline data={t.sparkline} className="hidden h-8 w-20 sm:block" fill={false} animate={false} />
              <div className="text-right">
                <div
                  key={t.priceUsd}
                  className={cn("tabular rounded px-1 text-sm font-medium", t.direction && `flash-${t.direction}`)}
                >
                  {formatUsd(t.priceUsd)}
                </div>
                <div className={cn("tabular text-xs", t.change24hPct >= 0 ? "text-up" : "text-down")}>
                  {formatPct(t.change24hPct)}
                </div>
              </div>
              <div className="relative z-10">
                <StarButton assetCode={t.symbol} watching />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
