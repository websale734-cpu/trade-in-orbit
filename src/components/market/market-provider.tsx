"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { MarketSnapshot, Ticker } from "@/lib/market/types";

/**
 * Live market data for Client Components.
 *
 * - Starts from the server-rendered CoinGecko snapshot (so the first paint has prices).
 * - Opens a Binance public WebSocket (mini-ticker stream) for real-time prices.
 * - Re-polls /api/market/tickers every 60s to refresh sparklines and stablecoins,
 *   and as a fallback when the WebSocket can't connect (e.g. blocked networks).
 *
 * WebSocket messages are buffered and flushed once per second to avoid
 * re-rendering on every tick.
 */

type Direction = "up" | "down" | null;
export type LiveTicker = Ticker & { direction: Direction };

type MarketValue = {
  tickers: LiveTicker[];
  unavailable: boolean;
  /** true while the real-time stream is connected. */
  live: boolean;
};

const MarketContext = createContext<MarketValue | null>(null);

const WS_BASE = process.env.NEXT_PUBLIC_BINANCE_WS_URL ?? "wss://stream.binance.com:443/stream";
const POLL_MS = 60_000;
const FLUSH_MS = 1_000;

export function MarketProvider({ initial, children }: { initial: MarketSnapshot; children: React.ReactNode }) {
  const [tickers, setTickers] = useState<LiveTicker[]>(() => initial.tickers.map((t) => ({ ...t, direction: null })));
  const [unavailable, setUnavailable] = useState(initial.unavailable);
  const [live, setLive] = useState(false);
  // Latest WS prices waiting to be applied: binanceSymbol -> { price, open24h }.
  const pending = useRef(new Map<string, { price: number; open: number }>());

  // Periodic REST refresh (sparklines, stablecoins, WS fallback).
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/market/tickers");
        if (!res.ok) return;
        const snap = (await res.json()) as MarketSnapshot;
        if (cancelled || snap.unavailable) return;
        setUnavailable(false);
        setTickers((prev) => {
          const prevBySymbol = new Map(prev.map((t) => [t.symbol, t]));
          return snap.tickers.map((t) => {
            const old = prevBySymbol.get(t.symbol);
            return { ...t, direction: old ? directionOf(old.priceUsd, t.priceUsd) : null };
          });
        });
      } catch {
        /* network hiccup: keep showing the last good data */
      }
    };
    // If the server had no data, try again straight away; otherwise wait a full interval.
    if (initial.unavailable) poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [initial.unavailable]);

  // Real-time WebSocket stream with exponential-backoff reconnects.
  useEffect(() => {
    const symbols = initial.tickers.map((t) => t.binanceSymbol).filter((s): s is string => !!s);
    if (symbols.length === 0) return;

    let ws: WebSocket | null = null;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      const streams = symbols.map((s) => `${s.toLowerCase()}@miniTicker`).join("/");
      ws = new WebSocket(`${WS_BASE}?streams=${streams}`);
      ws.onopen = () => {
        retry = 0;
        setLive(true);
      };
      ws.onmessage = (ev) => {
        try {
          // Combined stream payload: { stream, data: { s: "BTCUSDT", c: "close", o: "open" } }
          const msg = JSON.parse(ev.data as string) as { data?: { s: string; c: string; o: string } };
          if (!msg.data) return;
          pending.current.set(msg.data.s, { price: Number(msg.data.c), open: Number(msg.data.o) });
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        setLive(false);
        if (closed) return;
        retry = Math.min(retry + 1, 6);
        retryTimer = setTimeout(connect, 1000 * 2 ** retry);
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    const flush = setInterval(() => {
      if (pending.current.size === 0) return;
      const updates = new Map(pending.current);
      pending.current.clear();
      setTickers((prev) =>
        prev.map((t) => {
          const u = t.binanceSymbol ? updates.get(t.binanceSymbol) : undefined;
          if (!u || !Number.isFinite(u.price) || u.price === t.priceUsd) return { ...t, direction: null };
          const sparkline = t.sparkline.length ? [...t.sparkline.slice(0, -1), u.price] : t.sparkline;
          return {
            ...t,
            priceUsd: u.price,
            change24hPct: u.open > 0 ? ((u.price - u.open) / u.open) * 100 : t.change24hPct,
            sparkline,
            direction: directionOf(t.priceUsd, u.price),
          };
        }),
      );
    }, FLUSH_MS);

    return () => {
      closed = true;
      clearTimeout(retryTimer);
      clearInterval(flush);
      ws?.close();
    };
  }, [initial.tickers]);

  return <MarketContext.Provider value={{ tickers, unavailable, live }}>{children}</MarketContext.Provider>;
}

export function useMarket(): MarketValue {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error("useMarket must be used inside <MarketProvider>");
  return ctx;
}

function directionOf(prev: number, next: number): Direction {
  return next > prev ? "up" : next < prev ? "down" : null;
}
