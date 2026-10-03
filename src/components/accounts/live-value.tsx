"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useMarket, type LiveTicker } from "@/components/market/market-provider";
import { Sparkline } from "@/components/market/sparkline";
import { formatMoney } from "@/config/currencies";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { cn, formatUsd } from "@/lib/utils";

/** How often live prices are applied to the numbers on the accounts pages. */
const CALM_INTERVAL_MS = 10_000;
/** How long a number takes to glide to its new value. */
const EASE_MS = 900;

type Quote = { price: number; change24hPct: number; sparkline: number[] };
type Prices = ReadonlyMap<string, Quote>;

function toPrices(tickers: LiveTicker[]): Prices {
  const map = new Map<string, Quote>(
    tickers.map((t) => [t.symbol, { price: t.priceUsd, change24hPct: t.change24hPct, sparkline: t.sparkline }]),
  );
  map.set("USD", { price: 1, change24hPct: 0, sparkline: [] });
  return map;
}

/**
 * Live prices, applied at most every 10 seconds. The market feed updates every
 * second; following it directly makes balances tick constantly, which is
 * distracting on pages about your own money.
 */
export function useCalmPrices(intervalMs = CALM_INTERVAL_MS): Prices {
  const { tickers } = useMarket();
  const [prices, setPrices] = useState(() => toPrices(tickers));
  const latest = useRef(tickers);
  useEffect(() => {
    latest.current = tickers;
  }, [tickers]);
  useEffect(() => {
    const id = setInterval(() => setPrices(toPrices(latest.current)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return prices;
}

/** A dollar amount that glides to new values instead of jumping (instant with reduced motion). */
export function SmoothMoney({
  value,
  className,
  format = (n) => formatMoney(n, "usd"),
}: {
  value: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : EASE_MS;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      current.current = from + (value - from) * (1 - (1 - t) ** 3);
      setShown(current.current);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <span className={cn("tabular", className)}>{format(shown)}</span>;
}

export type Holding = { code: string; amount: string };

/** USD value of a set of holdings at calm live prices. Unpriced assets are left out. */
export function LiveValue({ holdings, className }: { holdings: Holding[]; className?: string }) {
  const prices = useCalmPrices();
  const total = holdings.reduce((sum, h) => sum + Number(h.amount) * (prices.get(h.code)?.price ?? 0), 0);
  return <SmoothMoney value={total} className={className} />;
}

/** USD value of one coin balance, or a quiet note when its price is unavailable. */
export function CoinValue({ code, amount, className }: Holding & { className?: string }) {
  const { dict } = useI18n();
  const price = useCalmPrices().get(code)?.price;
  if (!price) return <span className={cn("text-sm text-muted", className)}>{dict.app.accounts.unpriced}</span>;
  return <SmoothMoney value={Number(amount) * price} className={className} />;
}

/** Price stat tile for a coin: price, signed 24h change and a 7-day trend with its range in words. */
export function CoinPriceTile({ code }: { code: string }) {
  const { dict } = useI18n();
  const t = dict.app.accounts;
  const q = useCalmPrices().get(code);
  if (!q?.price) return <p className="text-sm text-muted">{t.unpriced}</p>;

  const up = q.change24hPct >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  const pct = `${up ? "+" : "−"}${Math.abs(q.change24hPct).toFixed(2)}%`;
  const low = q.sparkline.length ? Math.min(...q.sparkline) : null;
  const high = q.sparkline.length ? Math.max(...q.sparkline) : null;

  return (
    <div>
      <p className="text-sm text-muted">{t.coin.price}</p>
      <SmoothMoney value={q.price} format={formatUsd} className="mt-1 block text-3xl font-semibold tracking-tight" />
      <p className={cn("mt-2 flex items-center gap-1 text-sm", up ? "text-up" : "text-down")}>
        <Arrow className="h-4 w-4" aria-hidden />
        {fmt(t.coin.change24h, { pct })}
      </p>
      {low !== null && high !== null && (
        <div className="mt-6">
          <Sparkline data={q.sparkline} className="h-16 w-full" />
          <p className="mt-2 flex justify-between text-xs text-muted">
            <span>{t.coin.last7Days}</span>
            <span className="tabular">
              {formatUsd(low)} – {formatUsd(high)}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
