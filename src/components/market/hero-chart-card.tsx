"use client";

import { useMarket } from "./market-provider";
import { CoinIcon } from "./coin-icon";
import { Sparkline } from "./sparkline";
import { LiveBadge } from "./markets-section";
import { useI18n } from "@/i18n/client";
import { cn, formatPct, formatUsd } from "@/lib/utils";

/** Floating glass card in the hero: large BTC chart plus mini cards for ETH and SOL. */
export function HeroChartCard() {
  const { tickers, unavailable, live } = useMarket();
  const { dict } = useI18n();
  const main = tickers.find((t) => t.symbol === "BTC") ?? tickers[0];
  const minis = tickers.filter((t) => t.symbol === "ETH" || t.symbol === "SOL");

  return (
    <div className="relative">
      {/* Glow behind the card */}
      <div className="absolute -inset-8 -z-10 rounded-full bg-[radial-gradient(closest-side,var(--glow-violet),transparent)] blur-2xl" />

      <div className="glass ring-brand animate-float rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-wider text-subtle uppercase">{dict.hero.livePrices}</span>
          <LiveBadge live={live} labels={{ live: dict.markets.live, delayed: dict.markets.delayed }} />
        </div>

        {unavailable || !main ? (
          <div className="grid h-56 place-items-center text-center text-sm text-muted">{dict.markets.unavailable}</div>
        ) : (
          <>
            <div className="mt-5 flex items-center gap-3">
              <CoinIcon src={main.image} symbol={main.symbol} size={40} />
              <div>
                <div className="text-sm text-muted">{main.name}</div>
                <div
                  key={main.priceUsd}
                  className={cn(
                    "tabular rounded px-1 text-3xl font-semibold tracking-tight",
                    main.direction && `flash-${main.direction}`,
                  )}
                >
                  {formatUsd(main.priceUsd)}
                </div>
              </div>
              <span
                className={cn(
                  "tabular ml-auto text-sm font-semibold",
                  main.change24hPct >= 0 ? "text-up" : "text-down",
                )}
              >
                {formatPct(main.change24hPct)}
              </span>
            </div>
            <Sparkline data={main.sparkline} className="mt-5 h-36 w-full" strokeWidth={2.25} />
            <div className="mt-5 grid grid-cols-2 gap-3">
              {minis.map((m) => (
                <div key={m.symbol} className="rounded-2xl border border-line bg-surface p-3">
                  <div className="flex items-center gap-2">
                    <CoinIcon src={m.image} symbol={m.symbol} size={20} />
                    <span className="text-sm font-semibold">{m.symbol}</span>
                    <span
                      className={cn(
                        "tabular ml-auto text-xs font-medium",
                        m.change24hPct >= 0 ? "text-up" : "text-down",
                      )}
                    >
                      {formatPct(m.change24hPct)}
                    </span>
                  </div>
                  <div className="tabular mt-1 text-sm text-muted">{formatUsd(m.priceUsd)}</div>
                  <Sparkline data={m.sparkline} className="mt-2 h-10 w-full" fill={false} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
