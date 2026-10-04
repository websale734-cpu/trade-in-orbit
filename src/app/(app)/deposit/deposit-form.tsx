"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertTriangle, Banknote, Check, Copy, CreditCard, Smartphone, Wallet } from "lucide-react";
import { FormMessage, SubmitButton, inputClasses } from "@/components/ui/form";
import { SandboxBadge } from "@/components/app/kyc-gate";
import { cn, formatUsd } from "@/lib/utils";
import { sandboxCryptoDeposit } from "../sandbox-actions";
import { depositAddress, startDeposit } from "./actions";

type Method = {
  id: "BANK" | "CARD" | "MOBILE_MONEY" | "CRYPTO";
  mode: "live" | "sandbox" | "unavailable";
  feeBps: number;
  arrival: string;
};
const LABELS = { BANK: "Bank transfer", CARD: "Debit / credit card", MOBILE_MONEY: "Mobile money", CRYPTO: "Crypto" };
const ICONS = { BANK: Banknote, CARD: CreditCard, MOBILE_MONEY: Smartphone, CRYPTO: Wallet };

export function DepositForm({
  accounts,
  methods,
  minDeposit,
  coins,
  bank,
  devTools,
}: {
  accounts: { id: string; name: string }[];
  methods: Method[];
  minDeposit: number;
  coins: string[];
  bank: { accountName: string; bankName: string; accountNumber: string; routing: string; configured: boolean };
  devTools: boolean;
}) {
  const [methodId, setMethodId] = useState<Method["id"]>("BANK");
  const method = methods.find((m) => m.id === methodId)!;
  const [amount, setAmount] = useState("");
  const [state, action] = useActionState(startDeposit, undefined);
  const n = Number(amount) || 0;
  const fee = Math.ceil(n * method.feeBps) / 10_000;

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_1.1fr]">
      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6" aria-label="Deposit method">
        <h2 className="font-semibold">How would you like to deposit?</h2>
        <div className="mt-4 grid gap-2" role="radiogroup">
          {methods.map((m) => {
            const Icon = ICONS[m.id];
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={methodId === m.id}
                disabled={m.mode === "unavailable"}
                onClick={() => setMethodId(m.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-50",
                  methodId === m.id ? "border-accent bg-surface-strong" : "border-line hover:bg-surface",
                )}
              >
                <Icon className="h-5 w-5 text-accent" />
                <span className="flex-1 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    {LABELS[m.id]} {m.mode === "sandbox" && <SandboxBadge />}
                  </span>
                  <span className="text-xs text-muted">
                    {m.mode === "unavailable"
                      ? "Not available yet"
                      : `${m.feeBps ? `${m.feeBps / 100}% fee` : "No fee"} · ${m.arrival}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6" aria-label={LABELS[methodId]}>
        {methodId === "CRYPTO" ? (
          <CryptoDeposit coins={coins.filter((c) => c !== "USD")} devTools={devTools} />
        ) : state?.created ? (
          <Created created={state.created} bank={bank} onNew={() => window.location.reload()} />
        ) : (
          <form action={action} className="space-y-4" noValidate>
            <h2 className="font-semibold">{LABELS[methodId]}</h2>
            <FormMessage state={state} />
            <input type="hidden" name="method" value={methodId} />
            <div>
              <label htmlFor="accountId" className="mb-1.5 block text-sm font-medium">
                Deposit into
              </label>
              <select id="accountId" name="accountId" className={inputClasses}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="amount" className="mb-1.5 block text-sm font-medium">
                Amount (USD)
              </label>
              <input
                id="amount"
                name="amount"
                inputMode="decimal"
                placeholder={`Minimum ${minDeposit}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                className={cn(inputClasses, "tabular")}
              />
            </div>
            <dl className="space-y-1.5 rounded-xl border border-line bg-surface p-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Fee</dt>
                <dd className="tabular font-medium">{formatUsd(fee)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">You receive</dt>
                <dd className="tabular font-medium">{formatUsd(Math.max(0, n - fee))}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Arrives</dt>
                <dd className="font-medium">{method.arrival}</dd>
              </div>
            </dl>
            <SubmitButton>
              {methodId === "CARD" && method.mode === "live" ? "Continue to secure payment" : "Create deposit"}
            </SubmitButton>
            {method.mode === "sandbox" && (
              <p className="text-xs text-warn">
                Sandbox mode: no real payment is taken. Use &ldquo;Simulate confirmation&rdquo; in the history below.
              </p>
            )}
          </form>
        )}
      </section>
    </div>
  );
}

function Created({
  created,
  bank,
  onNew,
}: {
  created: { reference: string; method: string; amount: string; fee: string; sandbox: boolean };
  bank: { accountName: string; bankName: string; accountNumber: string; routing: string; configured: boolean };
  onNew: () => void;
}) {
  return (
    <div className="space-y-4 text-sm">
      <h2 className="flex items-center gap-2 font-semibold">
        <Check className="h-5 w-5 text-up" /> Deposit created {created.sandbox && <SandboxBadge />}
      </h2>
      {created.method === "BANK" ? (
        <>
          <p className="text-muted">
            Send exactly {formatUsd(Number(created.amount))} from a bank account in your own name, quoting the reference
            below. We&apos;ll credit it when it arrives.
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-line bg-surface p-4">
            <dt className="text-muted">Account name</dt>
            <dd className="font-medium">{bank.accountName}</dd>
            <dt className="text-muted">Bank</dt>
            <dd className="font-medium">{bank.bankName}</dd>
            <dt className="text-muted">Account no.</dt>
            <dd className="font-mono">{bank.accountNumber}</dd>
            <dt className="text-muted">Sort / routing</dt>
            <dd className="font-mono">{bank.routing}</dd>
            <dt className="text-muted">Reference</dt>
            <dd className="font-mono text-base font-bold text-accent">{created.reference}</dd>
          </dl>
          {!bank.configured && <p className="text-xs text-warn">Sandbox bank details: don&apos;t send real money.</p>}
        </>
      ) : created.method === "MOBILE_MONEY" ? (
        <p className="text-muted">Approve the payment request on your phone. Reference {created.reference}.</p>
      ) : (
        <p className="text-muted">Your card payment is pending confirmation. Reference {created.reference}.</p>
      )}
      <p className="text-muted">
        Status: <strong className="text-warn">Pending</strong> until the payment is confirmed.
      </p>
      <button type="button" onClick={onNew} className="text-sm font-medium text-accent hover:underline">
        Make another deposit
      </button>
    </div>
  );
}

function CryptoDeposit({ coins, devTools }: { coins: string[]; devTools: boolean }) {
  const [asset, setAsset] = useState(coins[0] ?? "BTC");
  const [info, setInfo] = useState<Awaited<ReturnType<typeof depositAddress>> | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    depositAddress(asset).then((r) => {
      if (!cancelled) {
        setInfo(r);
        setCopied(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [asset]);

  return (
    <div className="space-y-4 text-sm">
      <h2 className="font-semibold">Crypto deposit</h2>
      <select aria-label="Coin" value={asset} onChange={(e) => setAsset(e.target.value)} className={inputClasses}>
        {coins.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      {info === undefined ? (
        <div className="h-52 animate-pulse-soft rounded-xl bg-surface" />
      ) : info === null ? (
        <p className="text-muted">Crypto deposits aren&apos;t available yet.</p>
      ) : (
        <>
          {info.sandbox && (
            <div className="flex gap-2 rounded-xl border-2 border-warn bg-warn/10 p-3 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warn" />
              <span>
                <strong>SANDBOX ADDRESS: DO NOT SEND REAL FUNDS.</strong> No custody provider is connected, so this
                address is for testing only and can&apos;t receive coins.
              </span>
            </div>
          )}
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- server-generated data: URL */}
            <img
              src={info.qr}
              alt={`QR code for your ${asset} deposit address`}
              width={160}
              height={160}
              className="rounded-xl bg-white p-2"
            />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs text-muted">
                Network: <strong className="text-fg">{info.network}</strong>
              </p>
              <code className="block rounded-lg border border-line bg-surface p-2 font-mono text-xs break-all select-all">
                {info.address}
              </code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(info.address).catch(() => {});
                  setCopied(true);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-accent"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{" "}
                {copied ? "Copied" : "Copy address"}
              </button>
              <p className="text-xs text-muted">
                Send only {asset} on the {info.network} network. Other coins or networks may be lost permanently.
              </p>
            </div>
          </div>
          {devTools && info.sandbox && (
            <form action={sandboxCryptoDeposit} className="flex items-end gap-2 border-t border-line pt-4">
              <input type="hidden" name="asset" value={asset} />
              <label className="flex-1 text-xs text-muted">
                Simulate an incoming deposit
                <input
                  name="amount"
                  inputMode="decimal"
                  defaultValue="0.01"
                  className={cn(inputClasses, "tabular mt-1 h-10")}
                />
              </label>
              <button
                type="submit"
                className="h-10 rounded-full border border-warn/50 px-4 text-xs font-semibold text-warn hover:bg-warn/10"
              >
                Simulate
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
