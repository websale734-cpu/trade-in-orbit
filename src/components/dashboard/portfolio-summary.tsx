"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ChevronRight, DollarSign, Eye, EyeOff, Wallet } from "lucide-react";
import { useMarket } from "@/components/market/market-provider";
import { Donut, type DonutSegment } from "@/components/charts/donut";
import { EmptyState, Panel, StatCard } from "@/components/app/ui";
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

/** One tappable holding: colour key, coin and name on the left; value, amount and share on the right. */
function HoldingRow({
  href,
  code,
  name,
  color,
  value,
  detail,
}: {
  href?: string;
  code: string;
  name: string;
  color: string;
  value: React.ReactNode;
  detail: React.ReactNode;
}) {
  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: color }} aria-hidden />
        <span className="min-w-0">
          <span className="block font-semibold">{code}</span>
          <span className="block truncate text-xs text-muted sm:text-sm">{name}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span className="text-right">
          <span className="tabular block font-semibold">{value}</span>
          <span className="tabular block text-xs text-muted sm:text-sm">{detail}</span>
        </span>
        {href && <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden />}
      </span>
    </>
  );
  const base = "flex items-center justify-between gap-4 rounded-xl px-3 py-3.5 text-sm sm:px-4";
  return href ? (
    <Link href={href} className={cn(base, "transition-colors hover:bg-surface-strong focus-visible:bg-surface-strong")}>
      {inner}
    </Link>
  ) : (
    <div className={base}>{inner}</div>
  );
}

/**
 * Dashboard money overview, as separate cards: total balance (USD + local
 * currency), 24h change and cash, then a holdings card with the allocation
 * donut and one tappable row per coin. Values recompute live as prices stream
 * in. USD is valued at 1; an asset with no available price is listed but
 * excluded from totals, and the UI says so. The eye toggle hides every value.
 */
export function PortfolioSummary({
  holdings,
  currency,
  fxRate,
  linkByAsset,
  between,
  labels,
}: {
  holdings: Holding[];
  /** Rendered between the summary cards and the holdings card (e.g. quick actions). */
  between?: React.ReactNode;
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
    dayChange: string;
    cash: string;
    cashHint: string;
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
  const cash = rows.find((r) => r.code === "USD")?.qty ?? 0;

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

  const eye = (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={hidden ? labels.show : labels.hide}
      title={hidden ? labels.show : labels.hide}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-muted transition-colors hover:text-fg"
    >
      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
  const Trend = up ? ArrowUpRight : ArrowDownRight;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3" role="group" aria-label={labels.total}>
        <StatCard
          className="ring-brand sm:col-span-2 xl:col-span-1"
          label={labels.total}
          icon={<Wallet className="h-4 w-4" />}
          action={eye}
          value={money(total)}
          valueClassName="text-4xl sm:text-5xl"
          hint={!hidden && local !== null ? `≈ ${formatMoney(local, currency)}` : undefined}
        />
        <StatCard
          label={labels.dayChange}
          icon={<Trend className="h-4 w-4" />}
          value={
            hidden ? (
              DOTS
            ) : (
              <span className={up ? "text-up" : "text-down"}>
                {up ? "+" : "−"}
                {formatMoney(Math.abs(delta), "usd")}
              </span>
            )
          }
          hint={
            hidden ? undefined : (
              <span className={cn("inline-flex items-center gap-1 font-medium", up ? "text-up" : "text-down")}>
                <Trend className="h-4 w-4" />
                {deltaPct >= 0 ? "+" : ""}
                {deltaPct.toFixed(2)}%
              </span>
            )
          }
        />
        <StatCard
          label={labels.cash}
          icon={<DollarSign className="h-4 w-4" />}
          value={money(cash)}
          hint={labels.cashHint}
        />
      </div>

      {between}

      <Panel title={labels.breakdown} aria-label={labels.breakdown}>
        {priced.length === 0 && unpriced.length === 0 ? (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title={labels.empty} />
        ) : (
          <div className="grid items-center gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:gap-10">
            {segments.length > 1 && (
              <div className="justify-self-center">
                <Donut
                  segments={segments}
                  centerLabel={labels.breakdown}
                  centerValue={`${priced.length} ${labels.assets}`}
                  size={188}
                />
              </div>
            )}
            <div
              className={cn(
                "-mx-3 grid gap-1 sm:-mx-4",
                byValue.length + unpriced.length > 4 && "xl:grid-cols-2 xl:gap-x-3",
                segments.length > 1 ? "" : "md:col-span-2",
              )}
            >
              {byValue.map((r) => {
                const pct = total > 0 ? (r.value / total) * 100 : 0;
                return (
                  <HoldingRow
                    key={r.code}
                    href={linkByAsset?.[r.code]}
                    code={r.code}
                    name={r.name}
                    color={colorFor(r.code)}
                    value={money(r.value)}
                    detail={hidden ? amount(r.qty) : `${amount(r.qty)} · ${pct.toFixed(1)}%`}
                  />
                );
              })}
              {unpriced.map((r) => (
                <HoldingRow
                  key={r.code}
                  href={linkByAsset?.[r.code]}
                  code={r.code}
                  name={r.name}
                  color="var(--series-other)"
                  value={<span className="text-xs font-normal text-muted">{labels.unpriced}</span>}
                  detail={amount(r.qty)}
                />
              ))}
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}
