"use client";

import { useMarket } from "@/components/market/market-provider";
import { CoinIcon } from "@/components/market/coin-icon";
import { Sparkline } from "@/components/market/sparkline";
import { LiveBadge } from "@/components/market/markets-section";
import { StarButton } from "./star-button";
import { useI18n } from "@/i18n/client";
import { cn, formatPct, formatUsd } from "@/lib/utils";

/** All tracked coins with live prices and a watchlist star per row. */
export function MarketsTable({ watching }: { watching: string[] }) {
  const { tickers, unavailable, live } = useMarket();
  const { dict } = useI18n();
  const t = dict.markets;

  if (unavailable)
    return <div className="glass rounded-[var(--radius-card)] p-8 text-center text-sm text-muted">{t.unavailable}</div>;

  return (
    <div className="glass overflow-hidden rounded-[var(--radius-card)]">
      <div className="flex justify-end border-b border-line px-4 py-3 sm:px-6">
        <LiveBadge live={live} labels={{ live: t.live, delayed: t.delayed }} />
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs tracking-wide text-subtle uppercase">
          <tr className="border-b border-line">
            <th className="w-12 py-3 pl-2 sm:pl-4">
              <span className="sr-only">{dict.app.markets.watch}</span>
            </th>
            <th className="py-3 pr-4 font-medium">{t.asset}</th>
            <th className="px-4 py-3 text-right font-medium">{t.price}</th>
            <th className="px-4 py-3 text-right font-medium">{t.change24h}</th>
            <th className="hidden px-6 py-3 text-right font-medium md:table-cell">{t.chart7d}</th>
          </tr>
        </thead>
        <tbody>
          {tickers.map((c) => (
            <tr key={c.symbol} className="border-b border-line transition-colors last:border-0 hover:bg-surface">
              <td className="py-2 pl-2 sm:pl-4">
                <StarButton assetCode={c.symbol} watching={watching.includes(c.symbol)} />
              </td>
              <td className="py-3 pr-4">
                <div className="flex items-center gap-3">
                  <CoinIcon src={c.image} symbol={c.symbol} />
                  <div className="min-w-0">
                    <div className="font-semibold">{c.symbol}</div>
                    <div className="truncate text-xs text-muted">{c.name}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  key={c.priceUsd}
                  className={cn("tabular rounded px-1 font-medium", c.direction && `flash-${c.direction}`)}
                >
                  {formatUsd(c.priceUsd)}
                </span>
              </td>
              <td
                className={cn(
                  "tabular px-4 py-3 text-right font-medium",
                  c.change24hPct >= 0 ? "text-up" : "text-down",
                )}
              >
                {formatPct(c.change24hPct)}
              </td>
              <td className="hidden px-6 py-3 md:table-cell">
                <Sparkline data={c.sparkline} className="ml-auto h-8 w-28" fill={false} animate={false} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
