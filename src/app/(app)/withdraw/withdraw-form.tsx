"use client";

import { useActionState, useState, useTransition } from "react";
import { Field, FormMessage, SubmitButton, inputClasses } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { addAddress, confirmAddress, sendWithdrawalCode, submitWithdrawal } from "./actions";

type Method = "BANK" | "CARD" | "MOBILE_MONEY" | "CRYPTO";
const LABELS: Record<Method, string> = {
  BANK: "Bank transfer",
  CARD: "Card",
  MOBILE_MONEY: "Mobile money",
  CRYPTO: "Crypto wallet",
};
type Addr = { id: string; assetCode: string; label: string; address: string; confirmed: boolean };

export function WithdrawForm({
  accounts,
  addresses,
  fees,
  arrival,
  usesTotp,
}: {
  accounts: { id: string; name: string; balances: Record<string, string> }[];
  addresses: Addr[];
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
  const [state, action] = useActionState(submitWithdrawal, undefined);
  // Keep typed destination details after a failed attempt; clear them after success.
  const v = (k: string) => (state?.done ? "" : state?.values?.[k]);
  const [codeMsg, setCodeMsg] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  const acct = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const assetCode = method === "CRYPTO" ? asset : "USD";
  const available = Number(acct?.balances[assetCode] ?? 0);
  const n = Number(amount) || 0;
  const fee =
    method === "CRYPTO"
      ? Number(fees.network[asset]?.fee ?? 0)
      : fees.fiat[method].flat + (n * fees.fiat[method].bps) / 10_000;
  const cryptoAssets = Object.keys(fees.network).filter((c) => Number(acct?.balances[c] ?? 0) > 0);
  const usable = addresses.filter((a) => a.assetCode === asset && a.confirmed);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6" aria-label="Withdrawal request">
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
          <FormMessage state={state} />
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
              Available: {available.toLocaleString("en-US", { maximumFractionDigits: 8 })} {assetCode}
            </p>
          </div>

          {/* Destination */}
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
              <Field
                label="Provider"
                name="provider"
                placeholder="e.g. M-Pesa, MTN MoMo"
                defaultValue={v("provider")}
              />
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
            <div>
              <label htmlFor="addressId" className="mb-1.5 block text-sm font-medium">
                To address ({fees.network[asset]?.network})
              </label>
              {usable.length === 0 ? (
                <p className="rounded-xl border border-line bg-surface p-3 text-sm text-muted">
                  Add and confirm a {asset} address in your address book first →
                </p>
              ) : (
                <select id="addressId" name="addressId" className={inputClasses}>
                  {usable.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} · {a.address.slice(0, 8)}…{a.address.slice(-6)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <dl className="space-y-1.5 rounded-xl border border-line bg-surface p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{method === "CRYPTO" ? "Network fee" : "Fee"}</dt>
              <dd className="tabular font-medium">
                {fee.toLocaleString("en-US", { maximumFractionDigits: 8 })} {assetCode}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Total deducted</dt>
              <dd className="tabular font-medium">
                {(n + fee).toLocaleString("en-US", { maximumFractionDigits: 8 })} {assetCode}
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

          <div>
            <Field
              label={usesTotp ? "Authenticator code" : "Email confirmation code"}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
            />
            {!usesTotp && (
              <div className="mt-1.5 flex items-center gap-3 text-sm">
                <button
                  type="button"
                  disabled={sending}
                  onClick={() =>
                    startSending(async () => {
                      // Show the real reason (e.g. "wait 42s" or a rate limit), not a generic failure.
                      const r = await sendWithdrawalCode();
                      setCodeMsg(r.message ?? r.error ?? "Couldn't send the code.");
                    })
                  }
                  className="font-medium text-accent hover:underline disabled:opacity-50"
                >
                  Email me a code
                </button>
                {codeMsg && <span className="text-xs text-muted">{codeMsg}</span>}
              </div>
            )}
          </div>
          <SubmitButton>Request withdrawal</SubmitButton>
        </form>
      </section>

      <AddressBook addresses={addresses} assets={Object.keys(fees.network)} />
    </div>
  );
}

function AddressBook({ addresses, assets }: { addresses: Addr[]; assets: string[] }) {
  const [addState, addAction] = useActionState(addAddress, undefined);
  const [confirmState, confirmAction] = useActionState(confirmAddress, undefined);
  const pendingId = confirmState?.message ? undefined : (confirmState?.pendingId ?? addState?.pendingId);

  return (
    <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6" aria-label="Address book">
      <h2 className="font-semibold">Address book</h2>
      <p className="mt-1 text-xs text-muted">
        Crypto withdrawals can only go to saved addresses you&apos;ve confirmed by email.
      </p>
      <ul className="mt-3 divide-y divide-line text-sm">
        {addresses.length === 0 && <li className="py-2 text-muted">No saved addresses.</li>}
        {addresses.map((a) => (
          <li key={a.id} className="py-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">{a.label}</span>
              <span className="text-xs text-muted">{a.assetCode}</span>
              <span
                className={cn(
                  "ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold",
                  a.confirmed ? "bg-up/15 text-up" : "bg-warn/15 text-warn",
                )}
              >
                {a.confirmed ? "CONFIRMED" : "UNCONFIRMED"}
              </span>
            </div>
            <code className="mt-0.5 block truncate font-mono text-xs text-muted">{a.address}</code>
          </li>
        ))}
      </ul>

      {pendingId ? (
        <form action={confirmAction} className="mt-4 space-y-3 border-t border-line pt-4">
          <FormMessage state={confirmState ?? addState} />
          <input type="hidden" name="addressId" value={pendingId} />
          <Field
            label="Code from your email"
            name="code"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
          />
          <SubmitButton variant="secondary">Confirm address</SubmitButton>
        </form>
      ) : (
        <form action={addAction} className="mt-4 space-y-3 border-t border-line pt-4">
          <FormMessage state={confirmState?.message ? confirmState : addState} />
          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <select name="assetCode" aria-label="Coin" className={inputClasses}>
              {assets.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              name="label"
              placeholder="Label, e.g. Ledger"
              aria-label="Label"
              maxLength={40}
              className={inputClasses}
            />
          </div>
          <input
            name="address"
            placeholder="Wallet address"
            aria-label="Wallet address"
            autoComplete="off"
            className={cn(inputClasses, "font-mono text-xs")}
          />
          <SubmitButton variant="secondary">Add address</SubmitButton>
        </form>
      )}
    </section>
  );
}
