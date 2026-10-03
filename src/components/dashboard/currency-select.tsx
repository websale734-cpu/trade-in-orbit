"use client";

import { useRef } from "react";
import { setDisplayCurrency } from "@/app/(app)/actions";
import { DISPLAY_CURRENCIES } from "@/config/currencies";

/** Local-currency picker; saves immediately on change. */
export function CurrencySelect({ current, label }: { current: string; label: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const names = new Intl.DisplayNames(["en"], { type: "currency" });
  return (
    <form ref={formRef} action={setDisplayCurrency} className="flex items-center gap-2 text-sm">
      <label htmlFor="currency" className="text-muted">
        {label}
      </label>
      <select
        id="currency"
        name="currency"
        defaultValue={current}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-9 cursor-pointer rounded-full border border-line-strong bg-surface px-3 text-sm font-medium outline-none focus:border-accent"
      >
        {DISPLAY_CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c.toUpperCase()} · {names.of(c.toUpperCase())}
          </option>
        ))}
      </select>
    </form>
  );
}
