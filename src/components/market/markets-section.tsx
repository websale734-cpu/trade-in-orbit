"use client";

import { useMarket, type LiveTicker } from "./market-provider";
import { CoinIcon } from "./coin-icon";
import { Sparkline } from "./sparkline";
import { useI18n } from "@/i18n/client";
import { cn, formatPct, formatUsd } from "@/lib/utils";

/** Landing-page markets block: chart cards for the top coins plus a compact table. */
export function MarketsSection() {
  const { tickers, unavailable, live } = useMarket();
  const { dict } = useI18n();
  const t = dict.markets;

  if (unavailable) {
    return (
      <div className="glass rounded-[var(--radius-card)] p-8 text-center text-sm text-muted" role="status">
        {t.unavailable}
      </div>
    );
  }

  const featured = tickers.filter((c) => c.symbol !== "USDT").slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <LiveBadge live={live} labels={{ live: t.live, delayed: t.delayed }} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {featured.map((c, i) => (
          <ChartCard key={c.symbol} coin={c} delayMs={i * 80} />
        ))}
      </div>

      <div className="glass overflow-hidden rounded-[var(--radius-card)]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs tracking-wide text-subtle uppercase">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium sm:px-6">{t.asset}</th>
              <th className="px-4 py-3 text-right font-medium">{t.price}</th>
              <th className="px-4 py-3 text-right font-medium">{t.change24h}</th>
              <th className="hidden px-6 py-3 text-right font-medium md:table-cell">{t.chart7d}</th>
            </tr>
          </thead>
          <tbody>
            {tickers.map((c) => (
              <tr key={c.symbol} className="border-b border-line transition-colors last:border-0 hover:bg-surface">
                <td className="px-4 py-3 sm:px-6">
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
    </div>
  );
}

function ChartCard({ coin, delayMs }: { coin: LiveTicker; delayMs: number }) {
  const up = coin.change24hPct >= 0;
  return (
    <div
      className="glass group animate-fade-up rounded-[var(--radius-card)] p-5 transition-transform duration-300 hover:-translate-y-1"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CoinIcon src={coin.image} symbol={coin.symbol} size={32} />
          <div>
            <div className="font-semibold">{coin.name}</div>
            <div className="text-xs text-muted">{coin.symbol}/USD</div>
          </div>
        </div>
        <span
          className={cn(
            "tabular rounded-full px-2.5 py-1 text-xs font-semibold",
            up ? "bg-up/10 text-up" : "bg-down/10 text-down",
          )}
        >
          {formatPct(coin.change24hPct)}
        </span>
      </div>
      <div
        key={coin.priceUsd}
        className={cn(
          "tabular mt-4 inline-block rounded px-1 text-2xl font-semibold tracking-tight",
          coin.direction && `flash-${coin.direction}`,
        )}
      >
        {formatUsd(coin.priceUsd)}
      </div>
      <Sparkline data={coin.sparkline} className="mt-4 h-20 w-full" />
    </div>
  );
}

export function LiveBadge({ live, labels }: { live: boolean; labels: { live: string; delayed: string } }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
      <span className={cn("h-2 w-2 rounded-full", live ? "animate-pulse-soft bg-up" : "bg-warn")} />
      {live ? labels.live : labels.delayed}
    </span>
  );
}
