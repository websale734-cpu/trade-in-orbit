"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowLeft, ArrowLeftRight, ArrowUpRight, BarChart3, Minus, Plus } from "lucide-react";
import { useMarket } from "@/components/market/market-provider";
import { CoinIcon } from "@/components/market/coin-icon";
import { StatCard } from "@/components/app/ui";
import { CandleChart } from "./candle-chart";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import type { DayStats } from "@/lib/market/timeframes";
import { cn, formatPct, formatUsd } from "@/lib/utils";

/** "open": Buy and Sell; "paused": admin closed the pair; "quote": USDT itself, which is swapped instead. */
export type CoinTrading = "open" | "paused" | "quote";

const tradeBtn =
  "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-6 text-base font-semibold transition-transform active:scale-[0.98] sm:flex-none sm:min-w-36";

/**
 * A coin's page, shared by the public (/coins/[symbol]) and signed-in
 * (/markets/[symbol]) routes: live price and 24h change, Buy/Sell links to the
 * Trade page, the live candlestick chart and the 24h high/low/volume.
 *
 * The price follows the chart's own stream (the same Binance pair the candles
 * come from), falling back to the shared market feed until it connects.
 */
export function CoinView({
  code,
  name,
  pair,
  invert,
  initialStats,
  trading,
  backHref,
  star,
}: {
  code: string;
  name: string;
  pair: string;
  invert: boolean;
  initialStats: DayStats | null;
  trading: CoinTrading;
  backHref: string;
  /** Watchlist star, for signed-in viewers. */
  star?: React.ReactNode;
}) {
  const { dict } = useI18n();
  const t = dict.coin;
  const { tickers } = useMarket();
  const ticker = tickers.find((x) => x.symbol === code);
  const [stats, setStats] = useState<{ s: DayStats; dir: "up" | "down" | null } | null>(
    initialStats ? { s: initialStats, dir: null } : null,
  );
  const onStats = useCallback(
    (s: DayStats) =>
      setStats((prev) => ({
        s,
        dir: !prev || s.price === prev.s.price ? null : s.price > prev.s.price ? "up" : "down",
      })),
    [],
  );

  const price = stats?.s.price ?? ticker?.priceUsd ?? null;
  const pct = stats ? ((stats.s.price - stats.s.open) / stats.s.open) * 100 : (ticker?.change24hPct ?? 0);
  const delta = stats ? stats.s.price - stats.s.open : price !== null ? price - price / (1 + pct / 100) : 0;
  const up = pct >= 0;
  const Trend = up ? ArrowUpRight : ArrowDownRight;
  const pairLabel = invert ? "USDC/USDT" : `${code}/USDT`;

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.back}
      </Link>

      <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3 sm:gap-4">
            <CoinIcon src={ticker?.image ?? null} symbol={code} size={48} />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
              <p className="text-sm text-muted">
                {code} · {code === "USDT" ? "USD" : `${code}/USD`}
              </p>
            </div>
            {star && <div className="ml-1 shrink-0">{star}</div>}
          </div>

          <div className="mt-5 flex flex-wrap items-end gap-x-4 gap-y-2">
            <span
              key={price ?? 0}
              className={cn(
                "tabular -mx-1 rounded px-1 text-4xl font-semibold tracking-tight sm:text-5xl",
                stats?.dir && `flash-${stats.dir}`,
              )}
              aria-live="off"
            >
              {price !== null ? formatUsd(price) : "—"}
            </span>
            {price !== null && (
              <span
                className={cn(
                  "tabular mb-1 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold",
                  up ? "bg-up/10 text-up" : "bg-down/10 text-down",
                )}
              >
                <Trend className="h-4 w-4" />
                {up ? "+" : "−"}
                {formatUsd(Math.abs(delta))} ({formatPct(pct)})<span className="font-medium opacity-80">· 24h</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:items-end">
          {trading === "quote" ? (
            <Link href={`/trade?side=swap&asset=${code}`} className={cn(tradeBtn, "bg-brand text-white")}>
              <ArrowLeftRight className="h-5 w-5" />
              {fmt(t.swap, { code })}
            </Link>
          ) : (
            <div className="flex gap-3">
              {trading === "open" ? (
                <>
                  <Link href={`/trade?side=buy&asset=${code}`} className={cn(tradeBtn, "bg-up text-bg")}>
                    <Plus className="h-5 w-5" />
                    {fmt(t.buy, { code })}
                  </Link>
                  <Link href={`/trade?side=sell&asset=${code}`} className={cn(tradeBtn, "bg-down text-bg")}>
                    <Minus className="h-5 w-5" />
                    {fmt(t.sell, { code })}
                  </Link>
                </>
              ) : (
                <>
                  <span aria-disabled className={cn(tradeBtn, "cursor-not-allowed bg-surface-strong text-subtle")}>
                    <Plus className="h-5 w-5" />
                    {fmt(t.buy, { code })}
                  </span>
                  <span aria-disabled className={cn(tradeBtn, "cursor-not-allowed bg-surface-strong text-subtle")}>
                    <Minus className="h-5 w-5" />
                    {fmt(t.sell, { code })}
                  </span>
                </>
              )}
            </div>
          )}
          {trading === "quote" && <p className="max-w-sm text-sm text-muted lg:text-right">{t.quoteNote}</p>}
          {trading === "paused" && <p className="text-sm text-warn lg:text-right">{fmt(t.paused, { code })}</p>}
        </div>
      </header>

      <CandleChart code={code} pair={pair} invert={invert} onStats={onStats} />

      <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
        <StatCard
          label={t.change24h}
          icon={<Trend className="h-4 w-4" />}
          value={<span className={up ? "text-up" : "text-down"}>{formatPct(pct)}</span>}
          valueClassName="text-xl sm:text-2xl"
        />
        <StatCard
          label={t.high24h}
          icon={<ArrowUpRight className="h-4 w-4" />}
          value={stats ? formatUsd(stats.s.high) : "—"}
          valueClassName="text-xl sm:text-2xl"
        />
        <StatCard
          label={t.low24h}
          icon={<ArrowDownRight className="h-4 w-4" />}
          value={stats ? formatUsd(stats.s.low) : "—"}
          valueClassName="text-xl sm:text-2xl"
        />
        <StatCard
          label={t.volume24h}
          icon={<BarChart3 className="h-4 w-4" />}
          value={stats ? compactUsd(stats.s.quoteVolume) : "—"}
          valueClassName="text-xl sm:text-2xl"
        />
      </div>

      <p className="text-sm leading-relaxed text-subtle">
        {invert ? t.sourceInverted : fmt(t.source, { pair: pairLabel })}
      </p>
    </div>
  );
}

function compactUsd(v: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(v);
}
