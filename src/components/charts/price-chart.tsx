"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMarket } from "@/components/market/market-provider";
import { CoinIcon } from "@/components/market/coin-icon";
import { cn, formatPct, formatUsd } from "@/lib/utils";

const TIMEFRAMES = ["1D", "1W", "1M", "1Y"] as const;
type Tf = (typeof TIMEFRAMES)[number];
type Candle = [number, number];

const PLOT_H = 220;
const AXIS_H = 24;
const Y_AXIS_W = 64;

/**
 * Live price chart with a timeframe switcher.
 *
 * History comes from /api/market/candles; the last point follows the live
 * WebSocket price. Crosshair + tooltip on pointer and keyboard (arrow keys).
 * While a new timeframe loads, the previous render stays at reduced opacity
 * (no skeleton flash). A visually hidden table lists sampled points for
 * screen readers.
 */
export function PriceChart({
  assets,
  initialAsset = "BTC",
}: {
  assets: { code: string; name: string }[];
  initialAsset?: string;
}) {
  const { tickers } = useMarket();
  const [asset, setAsset] = useState(initialAsset);
  const [tf, setTf] = useState<Tf>("1D");
  const [data, setData] = useState<{ key: string; candles: Candle[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(640);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gradId = useId();
  const key = `${asset}:${tf}`;
  const loading = data?.key !== key && !error;
  // Labels describe the data on screen, which lags the selection while it loads.
  const shownTf = (data?.key.split(":")[1] as Tf | undefined) ?? tf;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/market/candles?asset=${asset}&tf=${tf}`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const body = (await r.json()) as { candles: Candle[] };
        if (!cancelled) {
          setData({ key: `${asset}:${tf}`, candles: body.candles });
          setError(null);
        }
      })
      .catch(() => !cancelled && setError("Chart data is temporarily unavailable."));
    return () => {
      cancelled = true;
    };
  }, [asset, tf]);

  // Replace the last close with the live price so the chart moves in real time.
  const ticker = tickers.find((t) => t.symbol === asset);
  const series = useMemo<Candle[]>(() => {
    const c = data?.candles ?? [];
    if (!c.length || !ticker || data?.key.split(":")[0] !== asset) return c;
    return [...c.slice(0, -1), [c[c.length - 1][0], ticker.priceUsd]];
  }, [data, ticker, asset]);

  const plotW = width - Y_AXIS_W;
  const geo = useMemo(() => {
    if (series.length < 2) return null;
    const vals = series.map((c) => c[1]);
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    const pad = (max - min) * 0.08 || max * 0.01;
    min -= pad;
    max += pad;
    const x = (i: number) => (i / (series.length - 1)) * plotW;
    const y = (v: number) => PLOT_H - ((v - min) / (max - min)) * PLOT_H;
    const line = series.map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(c[1]).toFixed(1)}`).join("");
    const area = `${line}L${plotW},${PLOT_H}L0,${PLOT_H}Z`;
    const yTicks = [0, 1, 2, 3].map((k) => min + ((max - min) * (k + 0.5)) / 4);
    const xTicks = [0.08, 0.36, 0.64, 0.92].map((f) => Math.round(f * (series.length - 1)));
    return { x, y, line, area, yTicks, xTicks };
  }, [series, plotW]);

  const first = series[0]?.[1];
  const last = series[series.length - 1]?.[1];
  const change = first && last ? ((last - first) / first) * 100 : 0;
  const up = change >= 0;
  const color = up ? "var(--up)" : "var(--down)";
  const h = hover !== null && series[hover] ? series[hover] : null;

  function indexFromPointer(clientX: number, rect: DOMRect) {
    const rel = Math.min(Math.max(0, clientX - rect.left), plotW);
    return Math.round((rel / plotW) * (series.length - 1));
  }

  return (
    <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6" aria-label="Price chart">
      {/* Controls: asset, then timeframe */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex items-center gap-2">
          <CoinIcon src={ticker?.image ?? null} symbol={asset} size={28} />
          <span className="sr-only">Asset</span>
          <select
            value={asset}
            onChange={(e) => {
              setAsset(e.target.value);
              setHover(null);
            }}
            className="cursor-pointer appearance-none rounded-lg bg-transparent pr-5 text-lg font-semibold outline-none"
          >
            {assets.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-0 text-xs text-muted">▾</span>
        </label>
        <div
          className="ml-auto flex rounded-full border border-line bg-surface p-1"
          role="radiogroup"
          aria-label="Timeframe"
        >
          {TIMEFRAMES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tf === t}
              onClick={() => {
                setTf(t);
                setHover(null);
              }}
              className={cn(
                "tabular rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                tf === t ? "bg-brand text-white" : "text-muted hover:text-fg",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Readout: hovered point, or latest price + change over the timeframe */}
      <div className="mt-4 min-h-14">
        <div className="text-3xl font-semibold tracking-tight">
          {h ? formatUsd(h[1]) : last ? formatUsd(last) : "—"}
        </div>
        <div className="mt-1 text-sm text-muted">
          {h ? (
            formatTime(h[0], shownTf)
          ) : series.length ? (
            <span className={up ? "text-up" : "text-down"}>
              {up ? "▲" : "▼"} {formatPct(change)} <span className="text-muted">over {shownTf}</span>
            </span>
          ) : null}
        </div>
      </div>

      <div ref={wrapRef} className={cn("relative mt-2 transition-opacity", loading && data && "opacity-40")}>
        {error ? (
          <div className="grid place-items-center text-sm text-muted" style={{ height: PLOT_H + AXIS_H }}>
            {error}
          </div>
        ) : !geo ? (
          <div className="animate-pulse-soft rounded-xl bg-surface" style={{ height: PLOT_H + AXIS_H }} />
        ) : (
          <svg
            width={width}
            height={PLOT_H + AXIS_H}
            className="block touch-pan-y outline-none"
            tabIndex={0}
            role="img"
            aria-label={`${asset} price over ${tf}. Use arrow keys to read values.`}
            onPointerMove={(e) => setHover(indexFromPointer(e.clientX, e.currentTarget.getBoundingClientRect()))}
            onPointerLeave={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setHover((i) => Math.max(0, (i ?? series.length) - 1));
              if (e.key === "ArrowRight") setHover((i) => Math.min(series.length - 1, (i ?? -1) + 1));
              if (e.key === "Escape") setHover(null);
            }}
            onBlur={() => setHover(null)}
          >
            <defs>
              <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* Hairline grid + y labels (right-aligned in the axis band) */}
            {geo.yTicks.map((v) => (
              <g key={v}>
                <line x1={0} x2={plotW} y1={geo.y(v)} y2={geo.y(v)} stroke="var(--chart-grid)" strokeWidth={1} />
                <text
                  x={width - 4}
                  y={geo.y(v) + 4}
                  textAnchor="end"
                  className="tabular fill-[var(--subtle)] text-[11px]"
                >
                  {formatAxis(v)}
                </text>
              </g>
            ))}
            {geo.xTicks.map((i) => (
              <text
                key={i}
                x={geo.x(i)}
                y={PLOT_H + 17}
                textAnchor="middle"
                className="tabular fill-[var(--subtle)] text-[11px]"
              >
                {formatTick(series[i][0], shownTf)}
              </text>
            ))}
            <path d={geo.area} fill={`url(#${gradId})`} />
            <path
              d={geo.line}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {h && hover !== null && (
              <g pointerEvents="none">
                <line x1={geo.x(hover)} x2={geo.x(hover)} y1={0} y2={PLOT_H} stroke="var(--muted)" strokeWidth={1} />
                <circle
                  cx={geo.x(hover)}
                  cy={geo.y(h[1])}
                  r={5}
                  fill={color}
                  stroke="var(--chart-surface)"
                  strokeWidth={2}
                />
              </g>
            )}
            {!h && (
              <circle
                cx={geo.x(series.length - 1)}
                cy={geo.y(last!)}
                r={4}
                fill={color}
                stroke="var(--chart-surface)"
                strokeWidth={2}
              >
                <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
          </svg>
        )}
      </div>

      {/* Table view for assistive technology */}
      {series.length > 0 && (
        <table className="sr-only">
          <caption>
            {asset} price, {tf}
          </caption>
          <thead>
            <tr>
              <th>Time</th>
              <th>Price (USD)</th>
            </tr>
          </thead>
          <tbody>
            {series
              .filter((_, i) => i % Math.ceil(series.length / 12) === 0 || i === series.length - 1)
              .map(([t, v]) => (
                <tr key={t}>
                  <td>{formatTime(t, tf)}</td>
                  <td>{formatUsd(v)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function formatAxis(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10_000 ? 1 : 2)}k`;
  if (v >= 1) return `$${v.toFixed(2)}`;
  return `$${v.toPrecision(3)}`;
}

function formatTick(t: number, tf: Tf): string {
  const d = new Date(t);
  if (tf === "1D") return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (tf === "1Y") return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatTime(t: number, tf: Tf): string {
  const d = new Date(t);
  return tf === "1Y"
    ? d.toLocaleDateString(undefined, { dateStyle: "medium" })
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
