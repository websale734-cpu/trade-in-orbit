"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, SubmitButton, inputClasses } from "@/components/ui/form";
import { useMarket } from "@/components/market/market-provider";
import { formatUsd } from "@/lib/utils";
import { createAlert } from "../automation-actions";

export function AlertForm({ coins }: { coins: string[] }) {
  const [state, action] = useActionState(createAlert, undefined);
  const { tickers } = useMarket();
  const [asset, setAsset] = useState(state?.values?.assetCode || coins[0]);
  const price = tickers.find((t) => t.symbol === asset)?.priceUsd;

  return (
    <form action={action} className="mt-4 space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="assetCode" className="mb-1.5 block text-sm font-medium">
            Coin
          </label>
          <select id="assetCode" name="assetCode" value={asset} onChange={(e) => setAsset(e.target.value)} className={inputClasses}>
            {coins.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          {price !== undefined && <p className="mt-1.5 text-xs text-muted">Now {formatUsd(price)}</p>}
        </div>
        <div>
          <label htmlFor="direction" className="mb-1.5 block text-sm font-medium">
            When price goes
          </label>
          <select id="direction" name="direction" defaultValue={state?.values?.direction || "ABOVE"} className={inputClasses}>
            <option value="ABOVE">Above</option>
            <option value="BELOW">Below</option>
          </select>
        </div>
      </div>
      <Field
        label="Target price (USD)"
        name="targetPrice"
        inputMode="decimal"
        required
        defaultValue={state?.message ? "" : state?.values?.targetPrice}
        error={state?.fieldErrors?.targetPrice}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notifyEmail" defaultChecked className="h-4 w-4 accent-[var(--accent)]" />
        Also email me
      </label>
      <SubmitButton variant="secondary">Create alert</SubmitButton>
    </form>
  );
}
