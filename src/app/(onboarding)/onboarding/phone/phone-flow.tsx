"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { ResendButton } from "@/components/auth/resend-button";
import { useI18n } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { resendPhoneCode, sendPhoneCode, verifyPhone } from "../actions";
import { CodeForm } from "../code-form";

/** Two screens: enter a number, then enter the code texted to it. */
export function PhoneFlow({
  pendingPhone,
  pendingPhoneMasked,
  initialCooldown,
}: {
  pendingPhone: string | null;
  pendingPhoneMasked: string | null;
  initialCooldown: number;
}) {
  const { dict } = useI18n();
  const t = dict.auth.phone;
  const [state, sendAction] = useActionState(sendPhoneCode, undefined);
  const [editing, setEditing] = useState(false);

  const sentTo = state?.sentTo ?? pendingPhone;
  const masked = state?.sentTo ? `${state.sentTo.slice(0, 3)} ••• ••• ${state.sentTo.slice(-4)}` : pendingPhoneMasked;

  if (sentTo && !editing) {
    return (
      <div className="space-y-5">
        <p className="rounded-xl border border-line bg-surface p-3 text-sm text-muted">
          {fmt(t.sentTo, { phone: masked ?? "" })}
        </p>
        <CodeForm action={verifyPhone} submitLabel={t.submit} />
        <ResendButton action={resendPhoneCode} initialCooldown={state?.cooldown ?? initialCooldown} />
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="block w-full text-center text-sm text-muted hover:text-fg"
        >
          {t.change}
        </button>
      </div>
    );
  }

  return (
    <form
      action={(fd) => {
        setEditing(false);
        sendAction(fd);
      }}
      className="space-y-4"
      noValidate
    >
      <FormMessage state={state} />
      <Field
        label={t.number}
        name="phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        placeholder="+44 7700 900123"
        hint={t.numberHint}
        required
        autoFocus
        defaultValue={state?.values?.phone}
        error={state?.fieldErrors?.phone}
      />
      <SubmitButton>{t.send}</SubmitButton>
    </form>
  );
}
