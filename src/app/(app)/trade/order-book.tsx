"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Level = [number, number];
type Book = { bids: Level[]; asks: Level[]; source: string };

/**
 * Order book: top 12 levels each side from the reference market, refreshed
 * every 5 seconds. Depth bars show cumulative size. Labelled with its source,
 * because Trade In Orbit fills orders against its liquidity partners, not against
 * other Trade In Orbit users.
 */
export function OrderBook({ coins }: { coins: string[] }) {
  const [asset, setAsset] = useState(coins[0] ?? "BTC");
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/market/depth?asset=${asset}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((b: Book) => {
          if (!cancelled) {
            setBook(b);
            setError(false);
          }
        })
        .catch(() => !cancelled && setError(true));
    load();
    const id = setInterval(load, 5_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [asset]);

  const cum = (levels: Level[]) => levels.reduce<number[]>((acc, [, q], i) => [...acc, (acc[i - 1] ?? 0) + q], []);
  const asks = book ? book.asks.slice(0, 10) : [];
  const bids = book ? book.bids.slice(0, 10) : [];
  const askCum = cum(asks);
  const bidCum = cum(bids);
  const maxCum = Math.max(askCum[askCum.length - 1] ?? 0, bidCum[bidCum.length - 1] ?? 0) || 1;
  const spread = asks[0] && bids[0] ? asks[0][0] - bids[0][0] : null;
  const fmtP = (p: number) =>
    p.toLocaleString("en-US", { maximumFractionDigits: p < 1 ? 5 : 2, minimumFractionDigits: 2 });
  const fmtQ = (q: number) => q.toLocaleString("en-US", { maximumFractionDigits: 4 });

  const Row = ({ level, c, side }: { level: Level; c: number; side: "ask" | "bid" }) => (
    <tr className="relative">
      <td className={cn("tabular relative z-10 py-1 pl-3", side === "ask" ? "text-down" : "text-up")}>
        {fmtP(level[0])}
      </td>
      <td className="tabular relative z-10 py-1 text-right">{fmtQ(level[1])}</td>
      <td className="tabular relative z-10 py-1 pr-3 text-right text-muted">
        {fmtQ(c)}
        <span
          aria-hidden
          className={cn("absolute inset-y-0.5 right-0 -z-10 rounded-l", side === "ask" ? "bg-down/12" : "bg-up/12")}
          style={{ width: `${(c / maxCum) * 100}%` }}
        />
      </td>
    </tr>
  );

  return (
    <section className="glass flex flex-col rounded-[var(--radius-card)] p-5 sm:p-6" aria-label="Order book">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Order book</h2>
        <select
          value={asset}
          onChange={(e) => setAsset(e.target.value)}
          className="h-9 rounded-full border border-line-strong bg-surface px-3 text-sm font-medium"
          aria-label="Order book asset"
        >
          {coins.map((c) => (
            <option key={c} value={c}>
              {c}/USDT
            </option>
          ))}
        </select>
      </div>
      {error && !book ? (
        <p className="mt-6 text-sm text-muted">The order book is temporarily unavailable.</p>
      ) : !book ? (
        <div className="mt-4 h-80 animate-pulse-soft rounded-xl bg-surface" />
      ) : (
        <table className="mt-4 w-full overflow-hidden text-xs sm:text-sm">
          <thead className="text-left text-xs tracking-wide text-subtle uppercase">
            <tr>
              <th className="pb-2 pl-3 font-medium">Price (USDT)</th>
              <th className="pb-2 text-right font-medium">Size ({asset})</th>
              <th className="pr-3 pb-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {[...asks.map((l, i) => ({ l, c: askCum[i] }))].reverse().map(({ l, c }) => (
              <Row key={`a${l[0]}`} level={l} c={c} side="ask" />
            ))}
            <tr>
              <td colSpan={3} className="border-y border-line py-2 text-center text-xs text-muted">
                Spread {spread !== null ? fmtP(spread) : "—"}
              </td>
            </tr>
            {bids.map((l, i) => (
              <Row key={`b${l[0]}`} level={l} c={bidCum[i]} side="bid" />
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-auto pt-3 text-xs text-subtle">
        Reference market depth · source: {book?.source ?? "Binance"}. Updates every 5 s.
      </p>
    </section>
  );
}
