"use client";

import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import { useMarket } from "@/components/market/market-provider";
import { Donut, type DonutSegment } from "@/components/charts/donut";
import { formatMoney } from "@/config/currencies";
import { cn } from "@/lib/utils";

export type Holding = { code: string; name: string; balance: string; sortOrder: number };

const SLOTS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
];
const MAX_SEGMENTS = 5;

/**
 * Total balance (USD + local currency), 24h change and holdings breakdown.
 * Values recompute live as prices stream in. USD is valued at 1; an asset with
 * no available price is listed but excluded from totals, and the UI says so.
 */
export function PortfolioSummary({
  holdings,
  currency,
  fxRate,
  labels,
}: {
  holdings: Holding[];
  currency: string;
  /** USD -> local currency. Null when rates are unavailable. */
  fxRate: number | null;
  labels: { total: string; change24h: string; breakdown: string; empty: string; unpriced: string; other: string };
}) {
  const { tickers } = useMarket();

  const rows = useMemo(() => {
    return holdings.map((h) => {
      const qty = Number(h.balance);
      if (h.code === "USD") return { ...h, qty, price: 1, change: 0, value: qty, value24hAgo: qty };
      const t = tickers.find((x) => x.symbol === h.code);
      if (!t) return { ...h, qty, price: null, change: 0, value: null, value24hAgo: null };
      const value = qty * t.priceUsd;
      return {
        ...h,
        qty,
        price: t.priceUsd,
        change: t.change24hPct,
        value,
        value24hAgo: value / (1 + t.change24hPct / 100),
      };
    });
  }, [holdings, tickers]);

  const priced = rows.filter((r) => r.value !== null) as Array<
    (typeof rows)[number] & { value: number; value24hAgo: number }
  >;
  const total = priced.reduce((s, r) => s + r.value, 0);
  const before = priced.reduce((s, r) => s + r.value24hAgo, 0);
  const delta = total - before;
  const deltaPct = before > 0 ? (delta / before) * 100 : 0;
  const up = delta >= 0;

  // Top holdings by value; the rest fold into "Other". Colour slots are assigned
  // by the asset's fixed order (not by rank), so a colour follows its asset.
  const byValue = [...priced].sort((a, b) => b.value - a.value);
  const top = byValue.slice(0, byValue.length > MAX_SEGMENTS + 1 ? MAX_SEGMENTS : MAX_SEGMENTS + 1);
  const rest = byValue.slice(top.length);
  const colourOrder = [...top].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => r.code);
  const segments: DonutSegment[] = top.map((r) => ({
    key: r.code,
    label: r.name,
    value: r.value,
    color: SLOTS[colourOrder.indexOf(r.code)] ?? "var(--series-other)",
    display: formatMoney(r.value, "usd"),
  }));
  const otherValue = rest.reduce((s, r) => s + r.value, 0);
  if (otherValue > 0)
    segments.push({
      key: "other",
      label: labels.other,
      value: otherValue,
      color: "var(--series-other)",
      display: formatMoney(otherValue, "usd"),
    });

  const local = fxRate !== null && currency !== "usd" ? total * fxRate : null;

  return (
    <section className="glass ring-brand rounded-[var(--radius-card)] p-6 sm:p-8" aria-label={labels.total}>
      <p className="text-sm font-medium text-muted">{labels.total}</p>
      {/* Hero figure: proportional figures, same sans as the UI */}
      <p className="mt-2 text-5xl font-semibold tracking-tight sm:text-6xl">{formatMoney(total, "usd")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {local !== null && <span className="text-muted">≈ {formatMoney(local, currency)}</span>}
        {total > 0 && (
          <span className={cn("inline-flex items-center gap-1 font-medium", up ? "text-up" : "text-down")}>
            {up ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            {formatMoney(Math.abs(delta), "usd")} ({deltaPct >= 0 ? "+" : ""}
            {deltaPct.toFixed(2)}%)
            <span className="font-normal text-muted">{labels.change24h}</span>
          </span>
        )}
      </div>

      {priced.length === 0 ? (
        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-dashed border-line-strong p-5 text-sm text-muted">
          <Wallet className="h-5 w-5 shrink-0" />
          {labels.empty}
        </div>
      ) : (
        <div className="mt-8 grid items-center gap-8 md:grid-cols-[auto_1fr]">
          {segments.length > 1 && (
            <Donut
              segments={segments}
              centerLabel={labels.breakdown}
              centerValue={`${priced.length} assets`}
              size={188}
            />
          )}
          {/* Legend = table view: every value readable without hovering */}
          <table className="w-full text-sm">
            <caption className="sr-only">{labels.breakdown}</caption>
            <tbody>
              {byValue.map((r) => {
                const seg = segments.find((s) => s.key === r.code);
                const pct = total > 0 ? (r.value / total) * 100 : 0;
                return (
                  <tr key={r.code} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-2.5">
                        <span
                          className="h-3 w-3 shrink-0 rounded-[3px]"
                          style={{ background: seg?.color ?? "var(--series-other)" }}
                          aria-hidden
                        />
                        <span className="font-medium">{r.code}</span>
                        <span className="hidden truncate text-muted sm:inline">{r.name}</span>
                      </span>
                    </td>
                    <td className="tabular py-2.5 pr-3 text-right text-muted">
                      {r.qty.toLocaleString("en-US", { maximumFractionDigits: 8 })}
                    </td>
                    <td className="tabular py-2.5 pr-3 text-right font-medium">{formatMoney(r.value, "usd")}</td>
                    <td className="tabular w-16 py-2.5 text-right text-muted">{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
              {rows
                .filter((r) => r.value === null)
                .map((r) => (
                  <tr key={r.code} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{r.code}</td>
                    <td className="tabular py-2.5 pr-3 text-right text-muted">{r.qty}</td>
                    <td colSpan={2} className="py-2.5 text-right text-xs text-muted">
                      {labels.unpriced}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
