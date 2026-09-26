"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { PasswordField } from "@/components/auth/password-field";
import { useI18n } from "@/i18n/client";
import { login } from "../actions";

export function LoginForm({ next, notice }: { next: string | null; notice: string | null }) {
  const { dict } = useI18n();
  const t = dict.auth.login;
  const [state, action] = useActionState(login, undefined);
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state ?? (notice ? { message: notice } : undefined)} />
      {next && <input type="hidden" name="next" value={next} />}
      <Field
        label={t.email}
        name="email"
        type="email"
        autoComplete="username"
        inputMode="email"
        required
        autoFocus
        defaultValue={state?.values?.email}
        error={fe.email}
      />
      <div>
        <PasswordField label={t.password} error={fe.password} />
        <div className="-mt-1 text-right">
          <Link href="/forgot-password" className="text-sm font-medium text-accent hover:underline">
            {t.forgot}
          </Link>
        </div>
      </div>
      <SubmitButton>{t.submit}</SubmitButton>
      <p className="text-center text-sm text-muted">
        {t.noAccount}{" "}
        <Link href="/register" className="font-medium text-accent hover:underline">
          {dict.common.createAccount}
        </Link>
      </p>
    </form>
  );
}
