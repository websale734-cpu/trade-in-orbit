"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Field, FormMessage, SubmitButton, inputClasses, type FormState } from "@/components/ui/form";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  reviewWithdrawal,
  sendWithdrawalCode,
  submitWithdrawal,
  type ReviewState,
  type WithdrawReview,
} from "./actions";

type Method = "BANK" | "CARD" | "MOBILE_MONEY" | "CRYPTO";
const LABELS: Record<Method, string> = {
  BANK: "Bank transfer",
  CARD: "Card",
  MOBILE_MONEY: "Mobile money",
  CRYPTO: "Crypto wallet",
};

const qty = (x: string | number) => Number(x).toLocaleString("en-US", { maximumFractionDigits: 8 });

export function WithdrawForm({
  accounts,
  fees,
  arrival,
  usesTotp,
}: {
  accounts: { id: string; name: string; balances: Record<string, string> }[];
  fees: {
    fiat: Record<string, { flat: number; bps: number }>;
    network: Record<string, { fee: string; network: string }>;
  };
  arrival: Record<Method, string>;
  usesTotp: boolean;
}) {
  const [method, setMethod] = useState<Method>("BANK");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [asset, setAsset] = useState("BTC");
  const [amount, setAmount] = useState("");
  const [state, action] = useActionState(reviewWithdrawal, undefined);
  // The review the user left (Back keeps the typed details; Done after a successful request clears them).
  const [left, setLeft] = useState<{ from: ReviewState; clear: boolean } | null>(null);
  const review = state?.review && left?.from !== state ? state.review : null;
  const v = (k: string) => (left?.from === state && left?.clear ? "" : state?.values?.[k]);

  const acct = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const assetCode = method === "CRYPTO" ? asset : "USD";
  const available = Number(acct?.balances[assetCode] ?? 0);
  const n = Number(amount) || 0;
  const fee =
    method === "CRYPTO"
      ? Number(fees.network[asset]?.fee ?? 0)
      : fees.fiat[method].flat + (n * fees.fiat[method].bps) / 10_000;
  const cryptoAssets = Object.keys(fees.network).filter((c) => Number(acct?.balances[c] ?? 0) > 0);

  if (review)
    return (
      <ConfirmStep
        key={review.id}
        review={review}
        method={method}
        arrival={arrival[method]}
        network={method === "CRYPTO" ? fees.network[review.assetCode]?.network : undefined}
        usesTotp={usesTotp}
        onBack={() => setLeft({ from: state!, clear: false })}
        onDone={() => {
          setLeft({ from: state!, clear: true });
          setAmount("");
        }}
      />
    );

  return (
    <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6 lg:max-w-3xl" aria-label="Withdrawal request">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Method">
        {(Object.keys(LABELS) as Method[]).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={method === m}
            onClick={() => {
              setMethod(m);
              setAmount("");
            }}
            className={cn(
              "rounded-xl border px-2 py-2.5 text-sm font-medium",
              method === m ? "border-accent bg-surface-strong" : "border-line text-muted hover:bg-surface",
            )}
          >
            {LABELS[m]}
          </button>
        ))}
      </div>

      <form action={action} className="mt-5 space-y-4" noValidate>
        {left?.from !== state && <FormMessage state={state} />}
        <input type="hidden" name="method" value={method} />
        <input type="hidden" name="assetCode" value={assetCode} />
        <div className={cn("grid gap-4", method === "CRYPTO" && "sm:grid-cols-2")}>
          <div>
            <label htmlFor="accountId" className="mb-1.5 block text-sm font-medium">
              From account
            </label>
            <select
              id="accountId"
              name="accountId"
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
          {method === "CRYPTO" && (
            <div>
              <label htmlFor="asset" className="mb-1.5 block text-sm font-medium">
                Coin
              </label>
              <select id="asset" value={asset} onChange={(e) => setAsset(e.target.value)} className={inputClasses}>
                {(cryptoAssets.length ? cryptoAssets : Object.keys(fees.network)).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="amount" className="mb-1.5 block text-sm font-medium">
            Amount ({assetCode})
          </label>
          <div className="relative">
            <input
              id="amount"
              name="amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              className={cn(inputClasses, "tabular pr-16")}
            />
            <button
              type="button"
              onClick={() => setAmount(String(Math.max(0, +(available - fee).toFixed(8))))}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2.5 py-1 text-xs font-semibold text-accent hover:bg-surface-strong"
            >
              Max
            </button>
          </div>
          <p className="tabular mt-1.5 text-xs text-muted">
            Available: {qty(available)} {assetCode}
          </p>
        </div>

        {/* Destination: typed in directly, nothing to save first. */}
        {method === "BANK" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account holder" name="holder" autoComplete="name" defaultValue={v("holder")} />
            <Field label="Bank name" name="bankName" defaultValue={v("bankName")} />
            <Field
              label="Account number / IBAN"
              name="account"
              className="sm:col-span-2"
              autoComplete="off"
              defaultValue={v("account")}
            />
          </div>
        )}
        {method === "MOBILE_MONEY" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider" name="provider" placeholder="e.g. M-Pesa, MTN MoMo" defaultValue={v("provider")} />
            <Field
              label="Mobile number"
              name="phone"
              type="tel"
              placeholder="+254 712 345678"
              defaultValue={v("phone")}
            />
          </div>
        )}
        {method === "CARD" && (
          <Field
            label="Last 4 digits of the card you deposited with"
            name="last4"
            defaultValue={v("last4")}
            inputMode="numeric"
            maxLength={4}
          />
        )}
        {method === "CRYPTO" && (
          <Field
            label={`${asset} wallet address`}
            name="address"
            placeholder="Paste the address you're sending to"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            defaultValue={v("address")}
            hint={`Only send on the ${fees.network[asset]?.network} network. Crypto sent to a wrong address can't be recovered.`}
          />
        )}

        <dl className="space-y-1.5 rounded-xl border border-line bg-surface p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">{method === "CRYPTO" ? "Network fee" : "Fee"}</dt>
            <dd className="tabular font-medium">
              {qty(fee)} {assetCode}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Total deducted</dt>
            <dd className="tabular font-medium">
              {qty(n + fee)} {assetCode}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Estimated arrival</dt>
            <dd className="font-medium">{arrival[method]}</dd>
          </div>
        </dl>

        <div>
          <label htmlFor="scheduledFor" className="mb-1.5 block text-sm font-medium">
            Schedule for later <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="scheduledFor"
            name="scheduledFor"
            defaultValue={v("scheduledFor")}
            type="date"
            className={inputClasses}
          />
        </div>

        <SubmitButton pendingLabel="Checking…">Continue</SubmitButton>
      </form>
    </section>
  );
}

/** Second screen: check the details and enter the confirmation code(s). */
function ConfirmStep({
  review,
  method,
  arrival,
  network,
  usesTotp,
  onBack,
  onDone,
}: {
  review: WithdrawReview;
  method: Method;
  arrival: string;
  network?: string;
  usesTotp: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const [state, action] = useActionState(submitWithdrawal, undefined);
  const [mail, setMail] = useState<FormState | null>(null);
  const [sending, startSending] = useTransition();
  const send = () =>
    startSending(async () => {
      // Show the real reason (e.g. a rate limit), not a generic failure.
      setMail(await sendWithdrawalCode());
    });
  // Email the code as soon as this screen opens (once, even under Strict Mode's double effects).
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    send();
  }, []);

  if (state?.done)
    return (
      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6 lg:max-w-3xl" aria-label="Withdrawal requested">
        <CheckCircle2 className="h-10 w-10 text-up" />
        <h2 className="mt-3 text-lg font-semibold">Withdrawal requested</h2>
        <p className="mt-1 text-sm text-muted">{state.message}</p>
        <p className="mt-1 text-sm text-muted">You can follow it under Withdrawal status below.</p>
        <button type="button" onClick={onDone} className={buttonClasses({ size: "lg", className: "mt-5 w-full" })}>
          Done
        </button>
      </section>
    );

  const rows: [string, string][] = [
    ["Method", LABELS[method]],
    ["From account", review.accountName],
    ["Amount", `${qty(review.amount)} ${review.assetCode}`],
    [method === "CRYPTO" ? "Network fee" : "Fee", `${qty(review.fee)} ${review.assetCode}`],
    ["Total deducted", `${qty(review.total)} ${review.assetCode}`],
    ...review.destination,
    ...(network ? ([["Network", network]] as [string, string][]) : []),
    ["Estimated arrival", arrival],
    ...(review.scheduledFor
      ? ([
          [
            "Scheduled for",
            new Date(review.scheduledFor).toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" }),
          ],
        ] as [string, string][])
      : []),
  ];

  return (
    <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6 lg:max-w-3xl" aria-label="Confirm withdrawal">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-sm font-medium text-accent hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Edit details
      </button>
      <h2 className="mt-3 text-lg font-semibold">Confirm your withdrawal</h2>
      <p className="mt-1 text-sm text-muted">
        Check the details below, then enter{" "}
        {usesTotp ? "the code from your authenticator app and the code we emailed you." : "the code we emailed you."}
      </p>

      <dl className="mt-4 space-y-1.5 rounded-xl border border-line bg-surface p-3 text-sm">
        {rows.map(([k, val]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="shrink-0 text-muted">{k}</dt>
            <dd className="tabular min-w-0 text-right font-medium break-all">{val}</dd>
          </div>
        ))}
      </dl>

      <form action={action} className="mt-5 space-y-4" noValidate>
        <FormMessage state={state} />
        {Object.entries(review.values).map(([k, val]) => (
          <input key={k} type="hidden" name={k} value={val} />
        ))}
        {usesTotp && (
          <Field
            label="Authenticator app code"
            name="totpCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            autoFocus
          />
        )}
        <div>
          <Field
            label="Code from your email"
            name="emailCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            autoFocus={!usesTotp}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className={cn("text-xs", mail?.error ? "text-down" : "text-muted")} role="status">
              {sending ? "Sending a code to your email…" : (mail?.message ?? mail?.error ?? "")}
            </span>
            <button
              type="button"
              disabled={sending}
              onClick={send}
              className="font-medium text-accent hover:underline disabled:opacity-50"
            >
              Resend code
            </button>
          </div>
        </div>
        <SubmitButton pendingLabel="Confirming…">Confirm withdrawal</SubmitButton>
      </form>
    </section>
  );
}
