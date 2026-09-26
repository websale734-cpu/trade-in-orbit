"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormMessage, SubmitButton, inputClasses } from "@/components/ui/form";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { transfer } from "./actions";

type Acct = { id: string; name: string; balances: { code: string; amount: string; decimals: number }[] };

/** "1.500000" -> "1.5", "100" -> "100" (only trims after a decimal point). */
function trimZeros(v: string) {
  return v.includes(".") ? v.replace(/0+$/, "").replace(/\.$/, "") : v;
}

/**
 * Instant transfer between the user's own accounts.
 *
 * A fresh idempotency key is generated per attempt, so a double-click or a
 * network retry can never post the same transfer twice (the ledger rejects a
 * repeated key).
 */
export function TransferForm({ accounts }: { accounts: Acct[] }) {
  const { dict } = useI18n();
  const t = dict.app.accounts;
  const [state, action] = useActionState(transfer, undefined);
  const funded = accounts.find((a) => a.balances.length > 0) ?? accounts[0];
  const [fromId, setFromId] = useState(funded.id);
  const [toId, setToId] = useState(accounts.find((a) => a.id !== funded.id)!.id);
  const from = accounts.find((a) => a.id === fromId)!;
  const [assetCode, setAssetCode] = useState(from.balances[0]?.code ?? "");
  const [amount, setAmount] = useState("");
  // Created at submit time (not during render, which would differ between server
  // and client). Reused until a transfer completes, so retries can't double-post.
  const keyRef = useRef<string | null>(null);

  const [seenDone, setSeenDone] = useState(state?.done);
  if (state?.done !== seenDone) {
    setSeenDone(state?.done);
    if (state?.done) setAmount("");
  }
  useEffect(() => {
    if (state?.done) keyRef.current = null;
  }, [state?.done]);

  const bal = from.balances.find((b) => b.code === assetCode);

  function pickFrom(id: string) {
    setFromId(id);
    const next = accounts.find((a) => a.id === id)!;
    setAssetCode(next.balances[0]?.code ?? "");
    if (toId === id) setToId(accounts.find((a) => a.id !== id)!.id);
  }

  return (
    <form
      action={(fd) => {
        keyRef.current ??= crypto.randomUUID();
        fd.set("idempotencyKey", keyRef.current);
        action(fd);
      }}
      className="mt-4 space-y-4"
      noValidate
    >
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="fromAccountId" className="mb-1.5 block text-sm font-medium">
            {t.from}
          </label>
          <select
            id="fromAccountId"
            name="fromAccountId"
            value={fromId}
            onChange={(e) => pickFrom(e.target.value)}
            className={inputClasses}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="toAccountId" className="mb-1.5 block text-sm font-medium">
            {t.to}
          </label>
          <select
            id="toAccountId"
            name="toAccountId"
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            className={inputClasses}
          >
            {accounts
              .filter((a) => a.id !== fromId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {from.balances.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-3 text-sm text-muted">{t.empty}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <div>
            <label htmlFor="assetCode" className="mb-1.5 block text-sm font-medium">
              {t.asset}
            </label>
            <select
              id="assetCode"
              name="assetCode"
              value={assetCode}
              onChange={(e) => setAssetCode(e.target.value)}
              className={inputClasses}
            >
              {from.balances.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="amount" className="mb-1.5 block text-sm font-medium">
              {t.amount}
            </label>
            <div className="relative">
              <input
                id="amount"
                name="amount"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                className={`${inputClasses} tabular pr-16`}
              />
              <button
                type="button"
                onClick={() => bal && setAmount(trimZeros(bal.amount))}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg px-2.5 py-1 text-xs font-semibold text-accent hover:bg-surface-strong"
              >
                {t.max}
              </button>
            </div>
            {bal && (
              <p className="tabular mt-1.5 text-xs text-muted">
                {fmt(t.available, {
                  amount: `${Number(bal.amount).toLocaleString("en-US", { maximumFractionDigits: bal.decimals })} ${bal.code}`,
                })}
              </p>
            )}
          </div>
        </div>
      )}

      <SubmitButton disabled={from.balances.length === 0}>{t.submitTransfer}</SubmitButton>
    </form>
  );
}
