"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Eye, EyeOff, Wallet } from "lucide-react";
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
const DOTS = "••••••";
const HIDE_KEY = "orb_hide_balance";
const HIDE_EVENT = "orb-hide-balance";

/**
 * Whether balances are hidden, backed by localStorage via useSyncExternalStore
 * so it's hydration-safe (server renders "shown") and shared across any
 * instance on the page. Returns the flag and a toggle.
 */
function useHiddenBalance(): [boolean, () => void] {
  const hidden = useSyncExternalStore(
    (cb) => {
      window.addEventListener(HIDE_EVENT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(HIDE_EVENT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => {
      try {
        return localStorage.getItem(HIDE_KEY) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const toggle = () => {
    try {
      localStorage.setItem(HIDE_KEY, hidden ? "0" : "1");
    } catch {
      /* storage blocked: the view still toggles for this render via the event */
    }
    window.dispatchEvent(new Event(HIDE_EVENT));
  };
  return [hidden, toggle];
}

/**
 * Total balance (USD + local currency), 24h change and holdings breakdown.
 * Values recompute live as prices stream in. USD is valued at 1; an asset with
 * no available price is listed but excluded from totals, and the UI says so.
 * Each holding is a tappable row linking to that coin's detail page, and an eye
 * toggle hides every monetary value (persisted per browser).
 */
export function PortfolioSummary({
  holdings,
  currency,
  fxRate,
  linkByAsset,
  labels,
}: {
  holdings: Holding[];
  currency: string;
  /** USD -> local currency. Null when rates are unavailable. */
  fxRate: number | null;
  /** assetCode -> href for that coin's detail page. */
  linkByAsset: Record<string, string>;
  labels: {
    total: string;
    change24h: string;
    breakdown: string;
    empty: string;
    unpriced: string;
    other: string;
    show: string;
    hide: string;
    assets: string;
  };
}) {
  const { tickers } = useMarket();
  const [hidden, toggle] = useHiddenBalance();
  const money = (v: number) => (hidden ? DOTS : formatMoney(v, "usd"));
  const amount = (v: number) => (hidden ? "••••" : v.toLocaleString("en-US", { maximumFractionDigits: 8 }));

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
    display: money(r.value),
  }));
  const otherValue = rest.reduce((s, r) => s + r.value, 0);
  if (otherValue > 0)
    segments.push({
      key: "other",
      label: labels.other,
      value: otherValue,
      color: "var(--series-other)",
      display: money(otherValue),
    });

  const local = fxRate !== null && currency !== "usd" ? total * fxRate : null;
  const colorFor = (code: string) => segments.find((s) => s.key === code)?.color ?? "var(--series-other)";
  const unpriced = rows.filter((r) => r.value === null);

  // One tappable holding row: colour dot, code + name, quantity and value.
  function HoldingRow({
    code,
    name,
    color,
    qtyText,
    valueNode,
  }: {
    code: string;
    name: string;
    color: string;
    qtyText: string;
    valueNode: React.ReactNode;
  }) {
    const href = linkByAsset?.[code];
    const inner = (
      <>
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: color }} aria-hidden />
          <span className="font-medium">{code}</span>
          <span className="hidden truncate text-muted sm:inline">{name}</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="tabular text-right text-muted">{qtyText}</span>
          <span className="tabular text-right font-medium">{valueNode}</span>
          {href && <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />}
        </span>
      </>
    );
    const className = "flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0 text-sm";
    return href ? (
      <Link href={href} className={cn(className, "-mx-2 rounded-lg px-2 transition-colors hover:bg-surface/60")}>
        {inner}
      </Link>
    ) : (
      <div className={className}>{inner}</div>
    );
  }

  return (
    <section className="glass ring-brand rounded-[var(--radius-card)] p-6 sm:p-8" aria-label={labels.total}>
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-muted">{labels.total}</p>
        <button
          type="button"
          onClick={toggle}
          aria-pressed={hidden}
          aria-label={hidden ? labels.show : labels.hide}
          title={hidden ? labels.show : labels.hide}
          className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-fg"
        >
          {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {/* Hero figure: proportional figures, same sans as the UI */}
      <p className="mt-2 text-5xl font-semibold tracking-tight sm:text-6xl">{money(total)}</p>
      {!hidden && (
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
      )}

      {priced.length === 0 && unpriced.length === 0 ? (
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
              centerValue={`${priced.length} ${labels.assets}`}
              size={188}
            />
          )}
          <div className={segments.length > 1 ? "" : "md:col-span-2"}>
            <h3 className="sr-only">{labels.breakdown}</h3>
            {byValue.map((r) => {
              const pct = total > 0 ? (r.value / total) * 100 : 0;
              return (
                <HoldingRow
                  key={r.code}
                  code={r.code}
                  name={r.name}
                  color={colorFor(r.code)}
                  qtyText={amount(r.qty)}
                  valueNode={
                    <span className="inline-flex items-baseline gap-2">
                      {money(r.value)}
                      {!hidden && <span className="w-12 text-right text-xs text-muted">{pct.toFixed(1)}%</span>}
                    </span>
                  }
                />
              );
            })}
            {unpriced.map((r) => (
              <HoldingRow
                key={r.code}
                code={r.code}
                name={r.name}
                color="var(--series-other)"
                qtyText={amount(r.qty)}
                valueNode={<span className="text-xs text-muted">{labels.unpriced}</span>}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
