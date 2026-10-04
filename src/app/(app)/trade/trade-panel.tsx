"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormMessage, SubmitButton, inputClasses } from "@/components/ui/form";
import { useMarket } from "@/components/market/market-provider";
import { CoinIcon } from "@/components/market/coin-icon";
import { cn } from "@/lib/utils";
import { submitTrade, type TradeState } from "./actions";

type Tab = "buy" | "sell" | "swap" | "limit";
type Acct = { id: string; name: string; balances: Record<string, string> };

/**
 * Buy / Sell / Swap / Limit ticket with a live fee preview.
 *
 * The preview uses the streaming price; the server re-prices at execution and
 * rejects the order if the price moved more than 1% against the user (the
 * price shown here is sent only as that bound). Each attempt carries an
 * idempotency key, so a double tap can't place two orders.
 */
export function TradePanel({
  demo,
  initialTab,
  accounts,
  coins,
  fees,
  quote,
}: {
  demo: boolean;
  initialTab: Tab;
  accounts: Acct[];
  coins: { code: string; name: string }[];
  fees: { instant: number; maker: number; taker: number };
  /** The coin buys are paid in and sells settle to (there is no cash balance). */
  quote: string;
}) {
  const { tickers } = useMarket();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [base, setBase] = useState("BTC");
  const [to, setTo] = useState("ETH");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [limitSide, setLimitSide] = useState<"BUY" | "SELL">("BUY");

  const [state, formAction] = useActionState<TradeState | undefined, FormData>(submitTrade, undefined);
  const keyRef = useRef<string | null>(null);
  useEffect(() => {
    if (state?.done) keyRef.current = null;
  }, [state?.done]);
  const [seen, setSeen] = useState(state?.done);
  if (state?.done !== seen) {
    setSeen(state?.done);
    if (state?.done) setAmount("");
  }

  const acct = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const bal = (code: string) => Number(acct?.balances[code] ?? 0);
  const usdPrice = (code: string) => tickers.find((t) => t.symbol === code)?.priceUsd ?? 0;
  // Prices are quoted in the quote coin (USDT), as the server prices them.
  const qPrice = usdPrice(quote) || 1;
  const price = (code: string) => (code === quote ? 1 : usdPrice(code) / qPrice);
  const fmtQ = (v: number) =>
    `${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${quote}`;
  const p = price(base);
  const n = Number(amount) || 0;
  const rate = (r: number) => r / 10_000;

  // Preview, mirroring the server's formulas.
  let preview: { label: string; value: string }[] = [];
  if (tab === "buy") {
    const gross = n / (1 + rate(fees.instant));
    preview = [
      { label: "Price", value: fmtQ(p) },
      { label: `Fee (${fees.instant / 100}%)`, value: fmtQ(n - gross) },
      { label: "You receive", value: p ? `≈ ${(gross / p).toFixed(8)} ${base}` : "—" },
    ];
  } else if (tab === "sell") {
    const gross = n * p;
    const fee = gross * rate(fees.instant);
    preview = [
      { label: "Price", value: fmtQ(p) },
      { label: `Fee (${fees.instant / 100}%)`, value: fmtQ(fee) },
      { label: "You receive", value: `≈ ${fmtQ(gross - fee)}` },
    ];
  } else if (tab === "swap") {
    const r = price(to) ? p / price(to) : 0;
    const fee = n * rate(fees.instant);
    preview = [
      { label: "Rate", value: r ? `1 ${base} = ${r.toPrecision(6)} ${to}` : "—" },
      { label: `Fee (${fees.instant / 100}%)`, value: `${fee.toPrecision(4)} ${base}` },
      { label: "You receive", value: r ? `≈ ${((n - fee) * r).toPrecision(8)} ${to}` : "—" },
    ];
  } else {
    const lp = Number(limitPrice) || 0;
    const notional = n * lp;
    preview = [
      { label: "Market price", value: fmtQ(p) },
      { label: `Maker fee (${fees.maker / 100}%)`, value: fmtQ(notional * rate(fees.maker)) },
      {
        label: "Reserved now",
        value: limitSide === "BUY" ? fmtQ(notional * (1 + rate(fees.maker))) : `${n} ${base}`,
      },
    ];
  }

  const spendAsset = tab === "buy" || (tab === "limit" && limitSide === "BUY") ? quote : base;
  // The quote coin can be swapped, but not bought or sold against itself.
  const cryptoCoins = tab === "swap" ? coins : coins.filter((c) => c.code !== quote);

  return (
    <section
      className={cn("glass rounded-[var(--radius-card)] p-5 sm:p-6", demo && "ring-2 ring-warn")}
      aria-label="Order ticket"
    >
      <div className="grid grid-cols-4 rounded-full border border-line bg-surface p-1" role="tablist">
        {(["buy", "sell", "swap", "limit"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              setAmount("");
              if (t !== "swap" && base === quote) setBase(coins.find((c) => c.code !== quote)?.code ?? "BTC");
            }}
            className={cn(
              "rounded-full py-2 text-sm font-semibold capitalize transition-colors",
              tab === t ? (t === "sell" ? "bg-down text-white" : "bg-brand text-white") : "text-muted hover:text-fg",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <form
        action={(fd) => {
          keyRef.current ??= crypto.randomUUID();
          fd.set("idempotencyKey", keyRef.current);
          formAction(fd);
        }}
        className="mt-5 space-y-4"
        noValidate
      >
        <FormMessage state={state} />
        <input type="hidden" name="kind" value={tab === "swap" ? "swap" : tab === "limit" ? "limit" : "market"} />
        <input type="hidden" name="demo" value={String(demo)} />
        <input type="hidden" name="accountId" value={demo ? "" : accountId} />
        {tab !== "swap" && tab !== "limit" && (
          <input type="hidden" name="side" value={tab === "buy" ? "BUY" : "SELL"} />
        )}
        {tab !== "limit" && tab !== "swap" && p > 0 && <input type="hidden" name="expectedPrice" value={String(p)} />}
        {tab === "swap" && p > 0 && price(to) > 0 && (
          <input type="hidden" name="expectedRate" value={String(p / price(to))} />
        )}

        {!demo && accounts.length > 1 && (
          <div>
            <label htmlFor="accountId-sel" className="mb-1.5 block text-sm font-medium">
              Account
            </label>
            <select
              id="accountId-sel"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className={inputClasses}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={cn("grid gap-4", tab === "swap" ? "grid-cols-2" : "grid-cols-1")}>
          <div>
            <label htmlFor="base" className="mb-1.5 block text-sm font-medium">
              {tab === "swap" ? "From" : "Asset"}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2">
                <CoinIcon src={tickers.find((t) => t.symbol === base)?.image ?? null} symbol={base} size={22} />
              </span>
              <select
                id="base"
                name={tab === "swap" ? "from" : "base"}
                value={base}
                onChange={(e) => setBase(e.target.value)}
                className={cn(inputClasses, "pl-11")}
              >
                {cryptoCoins.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {tab === "swap" && (
            <div>
              <label htmlFor="to" className="mb-1.5 block text-sm font-medium">
                To
              </label>
              <select id="to" name="to" value={to} onChange={(e) => setTo(e.target.value)} className={inputClasses}>
                {cryptoCoins
                  .filter((c) => c.code !== base)
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} · {c.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>

        {tab === "limit" && (
          <div className="grid grid-cols-2 rounded-xl border border-line p-1 text-sm font-semibold">
            {(["BUY", "SELL"] as const).map((s) => (
              <label
                key={s}
                className={cn(
                  "cursor-pointer rounded-lg py-2 text-center",
                  limitSide === s ? (s === "BUY" ? "bg-up/15 text-up" : "bg-down/15 text-down") : "text-muted",
                )}
              >
                <input
                  type="radio"
                  name="side"
                  value={s}
                  checked={limitSide === s}
                  onChange={() => setLimitSide(s)}
                  className="sr-only"
                />
                {s === "BUY" ? "Buy" : "Sell"}
              </label>
            ))}
          </div>
        )}

        <div className={cn("grid gap-4", tab === "limit" && "grid-cols-2")}>
          <div>
            <label htmlFor="amount" className="mb-1.5 block text-sm font-medium">
              {tab === "buy" ? `Spend (${quote})` : `Quantity (${base})`}
            </label>
            <div className="relative">
              <input
                id="amount"
                name={tab === "buy" ? "amount" : tab === "sell" ? "amount" : "quantity"}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                className={cn(inputClasses, "tabular pr-16")}
              />
              {tab !== "limit" && (
                <button
                  type="button"
                  onClick={() => setAmount(String(bal(spendAsset)))}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2.5 py-1 text-xs font-semibold text-accent hover:bg-surface-strong"
                >
                  Max
                </button>
              )}
            </div>
          </div>
          {tab === "limit" && (
            <div>
              <label htmlFor="limitPrice" className="mb-1.5 block text-sm font-medium">
                Limit price ({quote})
              </label>
              <input
                id="limitPrice"
                name="limitPrice"
                inputMode="decimal"
                autoComplete="off"
                placeholder={p ? p.toFixed(2) : "0.00"}
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value.replace(/[^\d.]/g, ""))}
                className={cn(inputClasses, "tabular")}
              />
            </div>
          )}
        </div>
        <p className="tabular -mt-2 text-xs text-muted">
          Available: {bal(spendAsset).toLocaleString("en-US", { maximumFractionDigits: 8 })} {spendAsset}
          {demo && <span className="ml-2 font-bold text-warn">DEMO</span>}
        </p>

        <dl className="space-y-1.5 rounded-xl border border-line bg-surface p-3 text-sm">
          {preview.map((row) => (
            <div key={row.label} className="flex justify-between gap-4">
              <dt className="text-muted">{row.label}</dt>
              <dd className="tabular font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>

        <SubmitButton
          className={tab === "sell" || (tab === "limit" && limitSide === "SELL") ? "bg-down !bg-none" : undefined}
        >
          {demo ? "DEMO · " : ""}
          {tab === "buy"
            ? `Buy ${base}`
            : tab === "sell"
              ? `Sell ${base}`
              : tab === "swap"
                ? `Swap ${base} → ${to}`
                : `Place limit ${limitSide.toLowerCase()}`}
        </SubmitButton>
        <p className="text-center text-xs text-subtle">
          Prices move. The final price is set when your order executes, within 1% of the price shown.
        </p>
      </form>
    </section>
  );
}
