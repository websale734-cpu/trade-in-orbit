"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { useI18n } from "@/i18n/client";
import { requestPasswordReset } from "../actions";

export function ForgotForm() {
  const { dict } = useI18n();
  const t = dict.auth.forgot;
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field
        label={dict.auth.login.email}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        autoFocus
        defaultValue={state?.values?.email}
        error={state?.fieldErrors?.email}
      />
      <SubmitButton>{t.submit}</SubmitButton>
      <p className="text-center text-sm">
        <Link href="/login" className="text-muted hover:text-fg">
          {t.back}
        </Link>
      </p>
    </form>
  );
}
