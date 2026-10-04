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

export type WithdrawCoin = { code: string; name: string; fee: string; networks: { id: string; label: string }[] };

const qty = (x: string | number) => Number(x).toLocaleString("en-US", { maximumFractionDigits: 8 });

/** Crypto withdrawal: coin, amount and destination wallet address, then a confirmation screen. */
export function WithdrawForm({
  accounts,
  coins,
  arrival,
  usesTotp,
}: {
  accounts: { id: string; name: string; balances: Record<string, string> }[];
  coins: WithdrawCoin[];
  arrival: string;
  usesTotp: boolean;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const acctFor = (id: string) => accounts.find((a) => a.id === id) ?? accounts[0];
  const held = (id: string) => coins.filter((c) => Number(acctFor(id)?.balances[c.code] ?? 0) > 0);
  const [asset, setAsset] = useState(() => (held(accounts[0]?.id ?? "")[0] ?? coins[0])?.code ?? "BTC");
  const [networkId, setNetworkId] = useState("");
  const [amount, setAmount] = useState("");
  const [state, action] = useActionState(reviewWithdrawal, undefined);
  // The review the user left (Back keeps the typed details; Done after a successful request clears them).
  const [left, setLeft] = useState<{ from: ReviewState; clear: boolean } | null>(null);
  const review = state?.review && left?.from !== state ? state.review : null;
  const v = (k: string) => (left?.from === state && left?.clear ? "" : state?.values?.[k]);

  const acct = acctFor(accountId);
  const coin = coins.find((c) => c.code === asset) ?? coins[0];
  const assetCode = coin?.code ?? asset;
  const available = Number(acct?.balances[assetCode] ?? 0);
  const n = Number(amount) || 0;
  const fee = Number(coin?.fee ?? 0);
  const listed = held(accountId);
  const multi = (coin?.networks.length ?? 0) > 1;
  const network = multi ? coin!.networks.find((x) => x.id === networkId) : coin?.networks[0];

  if (review)
    return (
      <ConfirmStep
        key={review.id}
        review={review}
        arrival={arrival}
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
      <h2 className="text-base font-semibold sm:text-lg">Withdraw to a crypto wallet</h2>
      <form action={action} className="mt-5 space-y-4" noValidate>
        {left?.from !== state && <FormMessage state={state} />}
        <input type="hidden" name="assetCode" value={assetCode} />
        <div className={cn("grid gap-4", accounts.length > 1 && "sm:grid-cols-2")}>
          {accounts.length > 1 ? (
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
          ) : (
            <input type="hidden" name="accountId" value={accountId} />
          )}
          <div>
            <label htmlFor="asset" className="mb-1.5 block text-sm font-medium">
              Coin
            </label>
            <select
              id="asset"
              value={assetCode}
              onChange={(e) => {
                setAsset(e.target.value);
                setNetworkId("");
                setAmount("");
              }}
              className={inputClasses}
            >
              {(listed.length ? listed : coins).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {multi ? (
          <div>
            <span className="mb-1.5 block text-sm font-medium">Network</span>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Network">
              {coin!.networks.map((x) => (
                <label
                  key={x.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors",
                    networkId === x.id ? "border-accent bg-surface-strong" : "border-line text-muted hover:bg-surface",
                  )}
                >
                  <input
                    type="radio"
                    name="networkId"
                    value={x.id}
                    checked={networkId === x.id}
                    onChange={() => setNetworkId(x.id)}
                    className="accent-[var(--color-accent)]"
                  />
                  {x.label}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <input type="hidden" name="networkId" value={coin?.networks[0]?.id ?? ""} />
        )}

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
        <Field
          label={`${assetCode} wallet address`}
          name="address"
          placeholder="Paste the address you're sending to"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          defaultValue={v("address")}
          hint={
            network
              ? `Use a ${assetCode} address on the ${network.label} network. Crypto sent to a wrong address can't be recovered.`
              : `Choose a network first. Crypto sent to a wrong address can't be recovered.`
          }
        />

        <dl className="space-y-1.5 rounded-xl border border-line bg-surface p-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Network fee</dt>
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
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Estimated arrival</dt>
            <dd className="text-right font-medium">{arrival}</dd>
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
  arrival,
  usesTotp,
  onBack,
  onDone,
}: {
  review: WithdrawReview;
  arrival: string;
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
        <h2 className="mt-3 text-lg font-semibold">Withdrawal submitted</h2>
        <p className="mt-1 text-sm text-muted">{state.message}</p>
        <p className="mt-1 text-sm text-muted">
          You can follow it under Withdrawal status below. We&apos;ll email you when it&apos;s approved or rejected.
        </p>
        <button type="button" onClick={onDone} className={buttonClasses({ size: "lg", className: "mt-5 w-full" })}>
          Done
        </button>
      </section>
    );

  const rows: [string, string][] = [
    ["From account", review.accountName],
    ["Coin", review.assetCode],
    ["Amount", `${qty(review.amount)} ${review.assetCode}`],
    ["Network fee", `${qty(review.fee)} ${review.assetCode}`],
    ["Total deducted", `${qty(review.total)} ${review.assetCode}`],
    ...review.destination,
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
