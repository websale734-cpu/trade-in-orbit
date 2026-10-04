"use client";

import { ArrowDownRight, ArrowUpRight, Star } from "lucide-react";
import { useMarket } from "@/components/market/market-provider";
import { CoinIcon } from "@/components/market/coin-icon";
import { Sparkline } from "@/components/market/sparkline";
import { LiveBadge } from "@/components/market/markets-section";
import { Panel, StatCard } from "@/components/app/ui";
import { StarButton } from "./star-button";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { cn, formatPct, formatUsd } from "@/lib/utils";

/** 24h change as a coloured pill. */
function ChangePill({ pct }: { pct: number }) {
  return (
    <span
      className={cn(
        "tabular inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        pct >= 0 ? "bg-up/10 text-up" : "bg-down/10 text-down",
      )}
    >
      {formatPct(pct)}
    </span>
  );
}

/** Columns shared by the header and every row so they stay aligned at each width. */
const COLS =
  "grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 sm:grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1fr)_6.5rem] md:grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1fr)_6.5rem_8rem]";

/**
 * Markets: three summary cards (top gainer, top loser, watchlist) and every
 * tracked coin with its live price. Phones get a two-line price/change cell;
 * wider screens get aligned columns and the 7-day sparkline.
 */
export function MarketsTable({ watching }: { watching: string[] }) {
  const { tickers, unavailable, live } = useMarket();
  const { dict } = useI18n();
  const t = dict.markets;
  const a = dict.app.markets;

  if (unavailable) return <Panel className="text-center text-sm text-muted">{t.unavailable}</Panel>;

  const sorted = [...tickers].sort((x, y) => y.change24hPct - x.change24hPct);
  const gainer = sorted[0];
  const loser = sorted[sorted.length - 1];

  return (
    <>
      {gainer && loser && (
        <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
          <StatCard
            label={a.topGainer}
            icon={<ArrowUpRight className="h-4 w-4" />}
            value={
              <span className="flex items-center gap-3">
                <CoinIcon src={gainer.image} symbol={gainer.symbol} size={32} />
                {gainer.symbol}
              </span>
            }
            hint={<ChangePill pct={gainer.change24hPct} />}
          />
          <StatCard
            label={a.topLoser}
            icon={<ArrowDownRight className="h-4 w-4" />}
            value={
              <span className="flex items-center gap-3">
                <CoinIcon src={loser.image} symbol={loser.symbol} size={32} />
                {loser.symbol}
              </span>
            }
            hint={<ChangePill pct={loser.change24hPct} />}
          />
          <StatCard
            className="col-span-2 lg:col-span-1"
            label={a.watching}
            icon={<Star className="h-4 w-4" />}
            value={fmt(a.coinsCount, { n: watching.length })}
          />
        </div>
      )}

      <Panel
        title={a.allCoins}
        action={<LiveBadge live={live} labels={{ live: t.live, delayed: t.delayed }} />}
        bodyClassName="-mx-2 sm:-mx-3"
      >
        <div
          className={cn(
            COLS,
            "hidden border-b border-line px-2 pb-3 text-xs font-medium tracking-wide text-subtle uppercase sm:grid sm:px-3",
          )}
          aria-hidden
        >
          <span />
          <span>{t.asset}</span>
          <span className="text-right">{t.price}</span>
          <span className="text-right">{t.change24h}</span>
          <span className="hidden text-right md:block">{t.chart7d}</span>
        </div>
        <ul className="divide-y divide-line">
          {tickers.map((c) => (
            <li
              key={c.symbol}
              className={cn(COLS, "rounded-xl px-2 py-3.5 transition-colors hover:bg-surface sm:px-3")}
            >
              <StarButton assetCode={c.symbol} watching={watching.includes(c.symbol)} />
              <div className="flex min-w-0 items-center gap-3">
                <CoinIcon src={c.image} symbol={c.symbol} />
                <div className="min-w-0">
                  <div className="font-semibold">{c.symbol}</div>
                  <div className="truncate text-xs text-muted sm:text-sm">{c.name}</div>
                </div>
              </div>
              {/* Phones: price and change stacked in one cell. */}
              <div className="flex flex-col items-end gap-1 text-right sm:block">
                <span
                  key={c.priceUsd}
                  className={cn("tabular rounded px-1 font-semibold", c.direction && `flash-${c.direction}`)}
                >
                  {formatUsd(c.priceUsd)}
                </span>
                <span className="sm:hidden">
                  <ChangePill pct={c.change24hPct} />
                </span>
              </div>
              <div className="hidden text-right sm:block">
                <ChangePill pct={c.change24hPct} />
              </div>
              <div className="hidden md:block">
                <Sparkline data={c.sparkline} className="ml-auto h-9 w-28" fill={false} animate={false} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
