"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { LiveBadge } from "@/components/market/markets-section";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import {
  TIMEFRAMES,
  TIMEFRAME_KEYS,
  dayStatsFrom,
  invertOhlc,
  type DayStats,
  type Ohlc,
  type Timeframe,
} from "@/lib/market/timeframes";
import { cn, formatPct, formatUsd } from "@/lib/utils";

const WS_BASE = process.env.NEXT_PUBLIC_BINANCE_WS_URL ?? "wss://stream.binance.com:443/stream";
/** While the stream is down, history is re-fetched this often so the chart still moves. */
const FALLBACK_POLL_MS = 30_000;
const INTERVAL_MS: Record<string, number> = { "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000 };

type Lib = typeof import("lightweight-charts");
type Chart = { lib: Lib; chart: IChartApi; candles: ISeriesApi<"Candlestick">; volume: ISeriesApi<"Histogram"> };

/**
 * Live candlestick chart for one coin (TradingView Lightweight Charts).
 *
 * History comes from /api/market/candles?ohlc=1; then one Binance WebSocket
 * carries the kline stream for the selected interval (the forming candle,
 * every ~2s) and the 24h mini-ticker (every second), whose last price is
 * merged into the forming candle so it moves with every tick. The 24h figures
 * are passed up through onStats. If the stream can't connect, history is
 * re-fetched every 30s instead. Times are drawn in the viewer's time zone.
 */
export function CandleChart({
  code,
  pair,
  invert,
  onStats,
}: {
  code: string;
  /** Binance pair, e.g. BTCUSDT. */
  pair: string;
  /** Chart 1 / price (USDT from USDC/USDT). */
  invert: boolean;
  onStats?: (s: DayStats) => void;
}) {
  const { dict } = useI18n();
  const t = dict.coin;
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const barsRef = useRef<Ohlc[]>([]);
  const onStatsRef = useRef(onStats);
  const [ready, setReady] = useState(false);
  const [tf, setTf] = useState<Timeframe>("1D");
  // The timeframe whose data is on screen; it lags `tf` while a switch loads.
  const [shown, setShown] = useState<{ tf: Timeframe; first: Ohlc; last: Ohlc } | null>(null);
  const [failed, setFailed] = useState<Timeframe | null>(null);
  const [live, setLive] = useState(false);
  const [hover, setHover] = useState<Ohlc | null>(null);

  useEffect(() => {
    onStatsRef.current = onStats;
  }, [onStats]);

  // Create the chart once; restyle it when the theme changes.
  useEffect(() => {
    let disposed = false;
    let observer: MutationObserver | undefined;
    import("lightweight-charts").then((lib) => {
      const el = elRef.current;
      if (disposed || !el) return;
      const chart = lib.createChart(el, {
        autoSize: true,
        crosshair: { mode: lib.CrosshairMode.Normal },
        // Let the page scroll vertically on phones; horizontal drag pans the chart.
        handleScroll: { vertTouchDrag: false },
        timeScale: { rightOffset: 3, secondsVisible: false, fixLeftEdge: true, lockVisibleTimeRangeOnResize: true },
        localization: { priceFormatter: (p: number) => formatUsd(p) },
      });
      const candles = chart.addSeries(lib.CandlestickSeries, { borderVisible: false });
      const volume = chart.addSeries(lib.HistogramSeries, {
        priceScaleId: "",
        priceFormat: { type: "volume" },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });
      chart.subscribeCrosshairMove((p) => {
        const d = p.time !== undefined ? p.seriesData.get(candles) : undefined;
        if (!d || !("open" in d)) return setHover(null);
        const bar = barsRef.current.find((b) => toTime(b[0]) === d.time);
        setHover(bar ?? null);
      });
      chartRef.current = { lib, chart, candles, volume };
      applyTheme(chartRef.current, barsRef.current);
      observer = new MutationObserver(() => chartRef.current && applyTheme(chartRef.current, barsRef.current));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      setReady(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      chartRef.current?.chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Load history for the timeframe, then stream live updates into it.
  useEffect(() => {
    const c = chartRef.current;
    if (!ready || !c) return;
    const { interval } = TIMEFRAMES[tf];
    const intervalMs = INTERVAL_MS[interval];
    let cancelled = false;
    let ws: WebSocket | null = null;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let isLive = false;
    barsRef.current = [];

    const publishRange = () => {
      const bars = barsRef.current;
      if (bars.length) setShown({ tf, first: bars[0], last: bars[bars.length - 1] });
    };

    const load = async () => {
      try {
        const res = await fetch(`/api/market/candles?asset=${code}&tf=${tf}&ohlc=1`);
        if (!res.ok) throw new Error();
        const { candles } = (await res.json()) as { candles: Ohlc[] };
        if (cancelled || !candles.length) return;
        // Keep a forming candle the stream already moved past this snapshot.
        const prevLast = barsRef.current.at(-1);
        const bars = candles.slice();
        if (prevLast && prevLast[0] >= bars[bars.length - 1][0]) {
          while (bars.length && bars[bars.length - 1][0] >= prevLast[0]) bars.pop();
          bars.push(prevLast);
        }
        barsRef.current = bars;
        const ref = bars[bars.length - 1][4];
        const precision = ref >= 100 ? 2 : ref >= 1 ? 4 : ref >= 0.01 ? 5 : 8;
        c.candles.applyOptions({ priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } });
        c.chart.applyOptions({ timeScale: { timeVisible: tf === "1D" || tf === "1W" } });
        c.candles.setData(bars.map(toCandle));
        c.volume.setData(bars.map(toVolume));
        c.chart.timeScale().fitContent();
        setFailed(null);
        publishRange();
      } catch {
        if (!cancelled && barsRef.current.length === 0) setFailed(tf);
      }
    };

    const apply = (bar: Ohlc) => {
      const bars = barsRef.current;
      const last = bars[bars.length - 1];
      if (!last || bar[0] < last[0]) return;
      if (bar[0] === last[0]) bars[bars.length - 1] = bar;
      else bars.push(bar);
      c.candles.update(toCandle(bar));
      c.volume.update(toVolume(bar));
      publishRange();
    };

    const connect = () => {
      const s = pair.toLowerCase();
      ws = new WebSocket(`${WS_BASE}?streams=${s}@kline_${interval}/${s}@miniTicker`);
      ws.onopen = () => {
        // After a drop, refill any candles missed while disconnected.
        if (retry > 0) load();
        retry = 0;
        isLive = true;
        setLive(true);
      };
      ws.onmessage = (ev) => {
        try {
          const { data } = JSON.parse(ev.data as string) as { data?: Record<string, unknown> };
          if (!data) return;
          if (data.e === "kline") {
            const k = data.k as Record<string, string | number>;
            const raw: Ohlc = [Number(k.t), Number(k.o), Number(k.h), Number(k.l), Number(k.c), Number(k.v)];
            apply(invert ? invertOhlc(raw) : raw);
          } else if (data.e === "24hrMiniTicker") {
            const stats = dayStatsFrom(
              { c: Number(data.c), o: Number(data.o), h: Number(data.h), l: Number(data.l), q: Number(data.q) },
              invert,
            );
            onStatsRef.current?.(stats);
            // Move the forming candle with the latest trade, unless its period has
            // ended and the next kline hasn't arrived yet.
            const last = barsRef.current.at(-1);
            if (last && Date.now() < last[0] + intervalMs && Number.isFinite(stats.price)) {
              const p = stats.price;
              apply([last[0], last[1], Math.max(last[2], p), Math.min(last[3], p), p, last[5]]);
            }
          }
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        isLive = false;
        setLive(false);
        if (cancelled) return;
        retry = Math.min(retry + 1, 6);
        retryTimer = setTimeout(connect, 1000 * 2 ** retry);
      };
      ws.onerror = () => ws?.close();
    };

    load();
    connect();
    const poll = setInterval(() => !isLive && load(), FALLBACK_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      clearInterval(poll);
      ws?.close();
    };
  }, [ready, tf, code, pair, invert]);

  const loading = shown?.tf !== tf && failed !== tf;
  const legend = hover ?? shown?.last ?? null;
  const change = shown ? ((shown.last[4] - shown.first[1]) / shown.first[1]) * 100 : null;
  const up = (change ?? 0) >= 0;

  return (
    <section className="glass min-w-0 rounded-[var(--radius-card)] p-4 sm:p-6" aria-label={t.chart}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-base font-semibold sm:text-lg">{t.chart}</h2>
          <LiveBadge live={live} labels={{ live: dict.markets.live, delayed: dict.markets.delayed }} />
        </div>
        <div className="flex rounded-full border border-line bg-surface p-1" role="radiogroup" aria-label={t.timeframe}>
          {TIMEFRAME_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={tf === k}
              onClick={() => {
                setTf(k);
                setHover(null);
              }}
              className={cn(
                "tabular min-w-11 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
                tf === k ? "bg-brand text-white" : "text-muted hover:text-fg",
              )}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* Change over the range on screen, and O/H/L/C of the hovered (or latest) candle */}
      <div className="mt-4 flex min-h-6 flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
        {change !== null && shown && (
          <span className={cn("tabular font-semibold", up ? "text-up" : "text-down")}>
            {up ? "▲" : "▼"} {formatPct(change)}{" "}
            <span className="font-normal text-muted">{fmt(t.overRange, { tf: shown.tf })}</span>
          </span>
        )}
        {legend && (
          <span className="tabular flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted sm:text-sm">
            {(
              [
                [t.open, legend[1]],
                [t.high, legend[2]],
                [t.low, legend[3]],
                [t.close, legend[4]],
              ] as const
            ).map(([label, v]) => (
              <span key={label}>
                {label} <span className={legend[4] >= legend[1] ? "text-up" : "text-down"}>{formatUsd(v)}</span>
              </span>
            ))}
          </span>
        )}
      </div>

      <div className="relative mt-3 h-[320px] sm:h-[420px] lg:h-[480px]">
        <div
          ref={elRef}
          className={cn("absolute inset-0 transition-opacity", loading && shown && "opacity-40")}
          role="img"
          aria-label={`${code} ${t.chart}, ${tf}`}
        />
        {failed === tf ? (
          <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted" role="status">
            {t.unavailable}
          </div>
        ) : (
          loading && !shown && <div className="absolute inset-0 animate-pulse-soft rounded-xl bg-surface" aria-hidden />
        )}
      </div>
    </section>
  );
}

/** Seconds since epoch shifted by the local UTC offset, so the chart's UTC axis reads as local time. */
function toTime(ms: number): UTCTimestamp {
  return (Math.floor(ms / 1000) - new Date(ms).getTimezoneOffset() * 60) as UTCTimestamp;
}

function toCandle([time, open, high, low, close]: Ohlc) {
  return { time: toTime(time), open, high, low, close };
}

let volumeColors = { up: "rgba(46,230,166,0.35)", down: "rgba(255,92,138,0.35)" };
function toVolume([time, open, , , close, value]: Ohlc) {
  return { time: toTime(time), value, color: close >= open ? volumeColors.up : volumeColors.down };
}

/** Theme tokens resolved to rgba() through a 1px canvas (the chart draws on canvas, not with CSS). */
function applyTheme({ lib, chart, candles, volume }: Chart, bars: Ohlc[]) {
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const styles = getComputedStyle(document.documentElement);
  const color = (name: string, alpha = 1) => {
    const value = styles.getPropertyValue(name).trim();
    if (!ctx || !value) return value || "transparent";
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r},${g},${b},${((a / 255) * alpha).toFixed(3)})`;
  };
  const up = color("--up");
  const down = color("--down");
  const grid = color("--chart-grid");
  const line = color("--line-strong");
  const muted = color("--muted");
  chart.applyOptions({
    layout: {
      background: { type: lib.ColorType.Solid, color: "rgba(0,0,0,0)" },
      textColor: color("--subtle"),
      fontSize: 12,
      fontFamily: getComputedStyle(document.body).fontFamily,
    },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderColor: line },
    timeScale: { borderColor: line },
    crosshair: {
      vertLine: { color: muted, labelBackgroundColor: color("--chart-surface") },
      horzLine: { color: muted, labelBackgroundColor: color("--chart-surface") },
    },
  });
  candles.applyOptions({ upColor: up, downColor: down, wickUpColor: up, wickDownColor: down });
  volumeColors = { up: color("--up", 0.35), down: color("--down", 0.35) };
  // Volume bars carry their own colour, so redraw any already on screen.
  if (bars.length) volume.setData(bars.map(toVolume));
}
