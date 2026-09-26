"use client";

import { useActionState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { PasswordField } from "@/components/auth/password-field";
import { changePassword } from "./actions";

export function ChangePasswordForm({ needsCode }: { needsCode: boolean }) {
  const [state, action] = useActionState(changePassword, undefined);
  const e = state?.fieldErrors;
  return (
    <form action={action} className="mt-4 space-y-4" noValidate>
      <FormMessage state={state} />
      <PasswordField label="Current password" name="currentPassword" autoComplete="current-password" error={e?.currentPassword} />
      <PasswordField
        label="New password"
        name="newPassword"
        autoComplete="new-password"
        meter
        error={e?.newPassword}
        hint="At least 12 characters. A passphrase of 3-4 random words works well."
      />
      {needsCode && (
        <Field label="2FA code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} error={e?.code} />
      )}
      <SubmitButton variant="secondary">Change password</SubmitButton>
    </form>
  );
}
