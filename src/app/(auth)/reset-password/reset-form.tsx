"use client";

import { useActionState } from "react";
import Link from "next/link";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { OtpInput } from "@/components/auth/otp-input";
import { PasswordField } from "@/components/auth/password-field";
import { useI18n } from "@/i18n/client";
import { resetPassword } from "../actions";

export function ResetForm({ email }: { email: string }) {
  const { dict } = useI18n();
  const t = dict.auth.reset;
  const [state, action] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="email" value={email} />
      <OtpInput label={dict.auth.code.label} invalid={!!state?.fieldErrors?.code} />
      {state?.fieldErrors?.code && <p className="-mt-3 text-sm text-down">{state.fieldErrors.code}</p>}
      <PasswordField
        label={t.newPassword}
        hint={dict.auth.register.passwordHint}
        error={state?.fieldErrors?.password}
        meter
        autoComplete="new-password"
      />
      <p className="text-xs text-muted">{t.signOutNote}</p>
      <SubmitButton>{t.submit}</SubmitButton>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-muted hover:text-fg">
          {dict.auth.code.resend}
        </Link>
      </p>
    </form>
  );
}
