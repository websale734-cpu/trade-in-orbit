"use client";

import { useActionState } from "react";
import { Field, FormMessage, SubmitButton, inputClasses } from "@/components/ui/form";
import { useI18n } from "@/i18n/client";
import { openAccount } from "./actions";

export function OpenAccountForm() {
  const { dict } = useI18n();
  const t = dict.app.accounts;
  const [state, action] = useActionState(openAccount, undefined);
  return (
    <form action={action} className="mt-4 space-y-4" noValidate>
      <FormMessage state={state} />
      <Field
        label={t.name}
        name="name"
        placeholder={t.namePlaceholder}
        maxLength={40}
        required
        defaultValue={state?.message ? "" : state?.values?.name}
        error={state?.fieldErrors?.name}
      />
      <div>
        <label htmlFor="type" className="mb-1.5 block text-sm font-medium">
          {t.type}
        </label>
        <select id="type" name="type" defaultValue={state?.values?.type || "SAVINGS"} className={inputClasses}>
          <option value="SAVINGS">{t.types.SAVINGS}</option>
          <option value="TRADING">{t.types.TRADING}</option>
        </select>
      </div>
      <SubmitButton variant="secondary">{t.create}</SubmitButton>
    </form>
  );
}
