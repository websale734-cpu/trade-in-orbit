"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { PasswordField } from "@/components/auth/password-field";
import { useI18n } from "@/i18n/client";
import { register } from "../actions";

export function RegisterForm() {
  const { dict } = useI18n();
  const t = dict.auth.register;
  const [state, action] = useActionState(register, undefined);
  const fe = state?.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field
        label={t.name}
        name="name"
        autoComplete="name"
        placeholder={t.namePlaceholder}
        required
        defaultValue={state?.values?.name}
        error={fe.name}
      />
      <Field
        label={t.email}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state?.values?.email}
        error={fe.email}
      />
      <PasswordField label={t.password} hint={t.passwordHint} error={fe.password} meter autoComplete="new-password" />

      <div>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-muted">
          <input
            type="checkbox"
            name="terms"
            required
            defaultChecked={state?.values?.terms === "on"}
            aria-invalid={!!fe.terms}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-[var(--accent-violet)]"
          />
          <span>
            {t.acceptPrefix}{" "}
            <Link href="/legal/terms" target="_blank" className="text-accent hover:underline">
              {t.terms}
            </Link>{" "}
            {t.and}{" "}
            <Link href="/legal/privacy" target="_blank" className="text-accent hover:underline">
              {t.privacy}
            </Link>
            , {t.riskPrefix}{" "}
            <Link href="/legal/risk" target="_blank" className="text-accent hover:underline">
              {t.risk}
            </Link>
            .
          </span>
        </label>
        {fe.terms && <p className="mt-1.5 text-sm text-down">{fe.terms}</p>}
      </div>

      <SubmitButton>{t.submit}</SubmitButton>
      <p className="text-center text-sm text-muted">
        {t.haveAccount}{" "}
        <Link href="/login" className="font-medium text-accent hover:underline">
          {dict.common.logIn}
        </Link>
      </p>
    </form>
  );
}
