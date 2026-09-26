"use client";

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { inputClasses } from "@/components/ui/form";
import { useMarket } from "@/components/market/market-provider";
import { formatUsd } from "@/lib/utils";

/** Coin converter (live prices) and fee calculator for each order type. */
export function Converter({
  coins,
  fees,
}: {
  coins: string[];
  fees: { instant: number; maker: number; taker: number };
}) {
  const { tickers } = useMarket();
  const [amount, setAmount] = useState("1");
  const [from, setFrom] = useState("BTC");
  const [to, setTo] = useState("USD");
  const [feeAmount, setFeeAmount] = useState("1000");
  const all = ["USD", ...coins];
  const price = (c: string) => (c === "USD" ? 1 : (tickers.find((t) => t.symbol === c)?.priceUsd ?? 0));
  const n = Number(amount) || 0;
  const converted = price(to) ? (n * price(from)) / price(to) : 0;
  const f = Number(feeAmount) || 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6" aria-label="Converter">
        <h2 className="font-semibold">Converter</h2>
        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-end gap-3">
          <div className="space-y-2">
            <input
              aria-label="Amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              className={`${inputClasses} tabular`}
            />
            <select aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClasses}>
              {all.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            aria-label="Swap direction"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
            className="mb-1 grid h-10 w-10 place-items-center rounded-full border border-line bg-surface hover:bg-surface-strong"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
          <div className="space-y-2">
            <output className="tabular flex h-12 items-center rounded-xl border border-line bg-surface-strong px-4 font-semibold">
              {converted ? converted.toLocaleString("en-US", { maximumFractionDigits: to === "USD" ? 2 : 8 }) : "—"}
            </output>
            <select aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className={inputClasses}>
              {all.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">Indicative, at live mid-market prices, before fees.</p>
      </section>

      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6" aria-label="Fee calculator">
        <h2 className="font-semibold">Fee calculator</h2>
        <label className="mt-4 block text-sm font-medium" htmlFor="fee-amount">
          Order value (USD)
        </label>
        <input
          id="fee-amount"
          inputMode="decimal"
          value={feeAmount}
          onChange={(e) => setFeeAmount(e.target.value.replace(/[^\d.]/g, ""))}
          className={`${inputClasses} tabular mt-1.5`}
        />
        <table className="mt-4 w-full text-sm">
          <tbody>
            {[
              ["Instant buy / sell / swap", fees.instant],
              ["Limit order (maker)", fees.maker],
              ["Market order (taker)", fees.taker],
            ].map(([label, bps]) => (
              <tr key={label as string} className="border-b border-line last:border-0">
                <td className="py-2 text-muted">
                  {label} · {(bps as number) / 100}%
                </td>
                <td className="tabular py-2 text-right font-medium">{formatUsd((f * (bps as number)) / 10_000)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted">Higher loyalty tiers get lower trading fees (coming with Rewards).</p>
      </section>
    </div>
  );
}
