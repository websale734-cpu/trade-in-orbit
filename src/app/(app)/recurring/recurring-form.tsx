"use client";

import { useActionState } from "react";
import { Field, FormMessage, SubmitButton, inputClasses } from "@/components/ui/form";
import { createRecurring } from "../automation-actions";

export function RecurringForm({ coins, accounts, min }: { coins: string[]; accounts: { id: string; name: string }[]; min: number }) {
  const [state, action] = useActionState(createRecurring, undefined);
  const v = state?.message ? undefined : state?.values;
  return (
    <form action={action} className="mt-4 space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="assetCode" className="mb-1.5 block text-sm font-medium">
            Buy
          </label>
          <select id="assetCode" name="assetCode" defaultValue={v?.assetCode || coins[0]} className={inputClasses}>
            {coins.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="frequency" className="mb-1.5 block text-sm font-medium">
            How often
          </label>
          <select id="frequency" name="frequency" defaultValue={v?.frequency || "WEEKLY"} className={inputClasses}>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </div>
      </div>
      <Field
        label="Amount per purchase (USD)"
        name="amountUsd"
        inputMode="decimal"
        hint={`Minimum $${min}. Includes the instant-trade fee.`}
        defaultValue={v?.amountUsd}
        error={state?.fieldErrors?.amountUsd}
      />
      <div>
        <label htmlFor="accountId" className="mb-1.5 block text-sm font-medium">
          Pay from
        </label>
        <select id="accountId" name="accountId" defaultValue={v?.accountId} className={inputClasses}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton variant="secondary">Start recurring buy</SubmitButton>
    </form>
  );
}
