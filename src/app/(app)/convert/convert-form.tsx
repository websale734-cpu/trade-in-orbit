"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowDown, CheckCircle2 } from "lucide-react";
import { useCalmPrices } from "@/components/accounts/live-value";
import { useMarket } from "@/components/market/market-provider";
import { FormMessage, SubmitButton, inputClasses } from "@/components/ui/form";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { assetLabel, formatQty } from "@/lib/assets";
import { cn } from "@/lib/utils";
import { convert } from "./actions";

type Asset = { code: string; name: string; decimals: number };
type Acct = { id: string; name: string; balances: Record<string, string> };
type Quote = { qty: number; fee: number; received: number; rate: number };

/** Keep digits and one decimal point, trimmed to the asset's decimal places. */
function cleanAmount(v: string, decimals: number) {
  const [whole, ...rest] = v.replace(/[^\d.]/g, "").split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, decimals)}` : whole;
}

/** "1.500000" -> "1.5", "500" -> "500" (only trims after a decimal point). */
function trimZeros(v: string) {
  return v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v;
}

/** A decimal string without exponent notation (tiny rates like 1.2e-7 included). */
function plain(n: number) {
  return n.toFixed(18).replace(/\.?0+$/, "");
}

/** Same arithmetic as the swap engine: the fee comes out of what you convert. */
function quote(qty: number, rate: number, feeBps: number, from: Asset, to: Asset): Quote {
  const fee = Math.ceil(qty * (feeBps / 10_000) * 10 ** from.decimals) / 10 ** from.decimals;
  const received = Math.floor((qty - fee) * rate * 10 ** to.decimals) / 10 ** to.decimals;
  return { qty, fee, received: Math.max(0, received), rate };
}

export function ConvertForm({
  accounts,
  assets,
  feeBps,
  slippagePct,
  initial,
}: {
  accounts: Acct[];
  assets: Asset[];
  feeBps: number;
  slippagePct: number;
  initial: { accountId?: string; from?: string; to?: string };
}) {
  const { dict } = useI18n();
  const t = dict.app.convert;
  const [state, action] = useActionState(convert, undefined);
  const calm = useCalmPrices(5_000);
  const { tickers } = useMarket();

  const byCode = new Map(assets.map((a) => [a.code, a]));
  const holdingsOf = (acct: Acct) => assets.filter((a) => Number(acct.balances[a.code] ?? 0) > 0);
  const pickTo = (fromCode: string, wanted?: string) =>
    [wanted, "BTC", "USDT", "USD"].find((c) => c && c !== fromCode && byCode.has(c)) ??
    assets.find((a) => a.code !== fromCode)!.code;

  const startAcct = accounts.find((a) => a.id === initial.accountId) ?? accounts[0];
  const startFrom =
    holdingsOf(startAcct).find((a) => a.code === initial.from)?.code ?? holdingsOf(startAcct)[0]?.code ?? "";
  const [accountId, setAccountId] = useState(startAcct.id);
  const [from, setFrom] = useState(startFrom);
  const [to, setTo] = useState(pickTo(startFrom, initial.to));
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"edit" | "review" | "done">("edit");
  const [frozen, setFrozen] = useState<Quote | null>(null);
  const [hideError, setHideError] = useState(false);
  // Created at submit time and reused until a conversion completes, so a retry can't convert twice.
  const keyRef = useRef<string | null>(null);

  const [seenDone, setSeenDone] = useState(state?.done);
  if (state?.done !== seenDone) {
    setSeenDone(state?.done);
    if (state?.done) {
      setStep("done");
      setAmount("");
    }
  }
  useEffect(() => {
    if (state?.done) keyRef.current = null;
  }, [state?.done]);

  const account = accounts.find((a) => a.id === accountId)!;
  const holdings = holdingsOf(account);
  const fromA = byCode.get(from);
  const toA = byCode.get(to)!;
  const available = Number(account.balances[from] ?? 0);
  const qty = Number(amount) || 0;
  const priceOf = (code: string, source: "calm" | "live") =>
    code === "USD"
      ? 1
      : source === "calm"
        ? calm.get(code)?.price
        : tickers.find((x) => x.symbol === code)?.priceUsd;
  const rateFrom = (source: "calm" | "live") => {
    const pf = priceOf(from, source);
    const pt = priceOf(to, source);
    return pf && pt ? pf / pt : null;
  };
  const calmRate = rateFrom("calm");
  const estimate = fromA && calmRate && qty > 0 ? quote(qty, calmRate, feeBps, fromA, toA) : null;
  const problem = !calmRate ? t.noPrice : qty > available ? t.tooMuch : null;

  function pickAccount(id: string) {
    setAccountId(id);
    const first = holdingsOf(accounts.find((a) => a.id === id)!)[0]?.code ?? "";
    setFrom(first);
    setTo(pickTo(first, to));
    setAmount("");
  }
  function pickFrom(code: string) {
    setFrom(code);
    if (code === to) setTo(pickTo(code));
    setAmount("");
  }
  function review() {
    const live = rateFrom("live") ?? calmRate;
    if (!fromA || !live) return;
    setFrozen(quote(qty, live, feeBps, fromA, toA));
    setHideError(true);
    setStep("review");
  }

  if (holdings.length === 0 && step !== "done")
    return (
      <div className="space-y-5 text-center">
        {accounts.length > 1 && <AccountPicker accounts={accounts} value={accountId} onChange={pickAccount} label={t.account} />}
        <p className="text-sm text-muted">{t.empty}</p>
        <ButtonLink href="/deposit">{t.deposit}</ButtonLink>
      </div>
    );

  if (step === "done")
    return (
      <div className="space-y-5 py-4 text-center" role="status">
        <CheckCircle2 className="mx-auto h-12 w-12 text-up" aria-hidden />
        <p className="text-lg font-semibold">{state?.message}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink href={`/accounts/${accountId}`}>{t.viewAccount}</ButtonLink>
          <button
            type="button"
            onClick={() => {
              setStep("edit");
              setFrom(holdings[0]?.code ?? from);
            }}
            className={buttonClasses({ variant: "secondary" })}
          >
            {t.again}
          </button>
        </div>
      </div>
    );

  if (step === "review" && frozen && fromA)
    return (
      <form
        action={(fd) => {
          keyRef.current ??= crypto.randomUUID();
          fd.set("idempotencyKey", keyRef.current);
          setHideError(false);
          action(fd);
        }}
        className="space-y-6"
      >
        <h2 className="text-lg font-semibold">{t.reviewTitle}</h2>
        {!hideError && <FormMessage state={state} />}
        <input type="hidden" name="accountId" value={accountId} />
        <input type="hidden" name="from" value={from} />
        <input type="hidden" name="to" value={to} />
        <input type="hidden" name="quantity" value={amount} />
        <input type="hidden" name="expectedRate" value={plain(frozen.rate)} />
        <dl className="divide-y divide-line rounded-2xl border border-line">
          <Row label={t.from} value={`${formatQty(frozen.qty, fromA.decimals)} ${from}`} />
          <Row label={t.estimate} value={`${formatQty(frozen.received, toA.decimals)} ${to}`} strong />
          <Row label={t.fee} value={fmt(t.feeValue, { amount: `${formatQty(frozen.fee, fromA.decimals)} ${from}`, pct: feeBps / 100 })} />
          <Row label={t.rateLabel} value={fmt(t.rate, { from, to, rate: formatQty(frozen.rate, 8) })} />
          <Row label={t.account} value={account.name} />
        </dl>
        <p className="text-xs leading-relaxed text-muted">{fmt(t.reviewNote, { pct: slippagePct })}</p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <button type="button" onClick={() => setStep("edit")} className={buttonClasses({ variant: "secondary", size: "lg" })}>
            {t.edit}
          </button>
          <SubmitButton className="sm:flex-1">{t.confirm}</SubmitButton>
        </div>
      </form>
    );

  return (
    <div className="space-y-6">
      {accounts.length > 1 && <AccountPicker accounts={accounts} value={accountId} onChange={pickAccount} label={t.account} />}

      <div className="rounded-2xl border border-line bg-surface p-4">
        <label htmlFor="convert-from" className="text-sm font-medium text-muted">
          {t.from}
        </label>
        <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_10rem]">
          <select id="convert-from" value={from} onChange={(e) => pickFrom(e.target.value)} className={inputClasses}>
            {holdings.map((a) => (
              <option key={a.code} value={a.code}>
                {assetLabel(a.code, a.name)}
              </option>
            ))}
          </select>
          <div className="relative">
            <input
              aria-label={t.amount}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(cleanAmount(e.target.value, fromA?.decimals ?? 8))}
              className={cn(inputClasses, "tabular pr-14")}
            />
            <button
              type="button"
              onClick={() => setAmount(trimZeros(cleanAmount(account.balances[from] ?? "", fromA?.decimals ?? 8)))}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-accent hover:bg-surface-strong"
            >
              {t.max}
            </button>
          </div>
        </div>
        <p className="tabular mt-2 text-xs text-muted">
          {fmt(t.available, { amount: `${formatQty(available, fromA?.decimals)} ${from}` })}
        </p>
      </div>

      <div className="-my-3 flex justify-center" aria-hidden>
        <span className="grid h-9 w-9 place-items-center rounded-full border border-line bg-bg-elevated text-muted">
          <ArrowDown className="h-4 w-4" />
        </span>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <label htmlFor="convert-to" className="text-sm font-medium text-muted">
          {t.to}
        </label>
        <select id="convert-to" value={to} onChange={(e) => setTo(e.target.value)} className={cn(inputClasses, "mt-2")}>
          {assets
            .filter((a) => a.code !== from)
            .map((a) => (
              <option key={a.code} value={a.code}>
                {assetLabel(a.code, a.name)}
              </option>
            ))}
        </select>
        <p className="mt-4 text-sm text-muted">{t.estimate}</p>
        <p className="tabular mt-1 text-2xl font-semibold">
          {estimate ? `${formatQty(estimate.received, toA.decimals)} ${to}` : "—"}
        </p>
      </div>

      <div className="space-y-1 text-sm text-muted">
        {calmRate && <p>{fmt(t.rate, { from, to, rate: formatQty(calmRate, 8) })}</p>}
        {estimate && (
          <p>
            {t.fee}: {fmt(t.feeValue, { amount: `${formatQty(estimate.fee, fromA?.decimals)} ${from}`, pct: feeBps / 100 })}
          </p>
        )}
      </div>

      {qty > 0 && problem && (
        <p role="alert" className="rounded-xl border border-down/30 bg-down/10 p-3 text-sm">
          {problem}
        </p>
      )}
      <button
        type="button"
        onClick={review}
        disabled={!estimate || estimate.received <= 0 || !!problem}
        className={buttonClasses({ size: "lg", className: "w-full" })}
      >
        {qty > 0 ? t.review : t.enterAmount}
      </button>
    </div>
  );
}

function AccountPicker({
  accounts,
  value,
  onChange,
  label,
}: {
  accounts: Acct[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div className="text-left">
      <label htmlFor="convert-account" className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <select id="convert-account" value={value} onChange={(e) => onChange(e.target.value)} className={inputClasses}>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("tabular text-right", strong ? "text-base font-semibold" : "font-medium")}>{value}</dd>
    </div>
  );
}
