"use client";

import { useActionState } from "react";
import { AlertTriangle } from "lucide-react";
import { Field, FormMessage, SubmitButton, inputClasses } from "@/components/ui/form";
import { PasswordField } from "@/components/auth/password-field";
import { CopyButton } from "@/components/ui/copy-button";
import { createKey } from "./actions";

export function CreateKeyForm() {
  const [state, action] = useActionState(createKey, undefined);
  if (state?.token)
    return (
      <div className="mt-4 space-y-3" data-testid="new-key">
        <div role="status" className="flex gap-2.5 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <span>Copy this key now and store it securely. For your safety we only store a hash, so it can&apos;t be shown again.</span>
        </div>
        <code className="block rounded-xl border border-line bg-surface-strong p-3 font-mono text-xs break-all" data-testid="api-token">
          {state.token}
        </code>
        <CopyButton value={state.token} label="Copy key" />
      </div>
    );
  const v = state?.values;
  return (
    <form action={action} className="mt-4 space-y-4" noValidate>
      <FormMessage state={state?.error ? state : undefined} />
      <Field label="Key name" name="name" maxLength={40} placeholder="e.g. My trading bot" defaultValue={v?.name} error={state?.fieldErrors?.name} />
      <div>
        <label htmlFor="permission" className="mb-1.5 block text-sm font-medium">
          Permission
        </label>
        <select id="permission" name="permission" defaultValue={v?.permission || "READ"} className={inputClasses}>
          <option value="READ">Read only: balances, prices, orders</option>
          <option value="TRADE">Trade: read + place and cancel orders</option>
        </select>
        <p className="mt-1.5 text-xs text-muted">No API key can withdraw or transfer funds.</p>
      </div>
      <PasswordField label="Confirm your password" name="password" autoComplete="current-password" error={state?.fieldErrors?.password} />
      <SubmitButton variant="secondary">Create key</SubmitButton>
    </form>
  );
}
