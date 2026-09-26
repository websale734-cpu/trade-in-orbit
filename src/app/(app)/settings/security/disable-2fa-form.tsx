"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { OtpInput } from "@/components/auth/otp-input";
import { useI18n } from "@/i18n/client";
import { turnOffTwoFactor } from "./actions";

export function DisableTwoFactorForm({ label }: { label: string }) {
  const { dict } = useI18n();
  const [state, action] = useActionState(turnOffTwoFactor, undefined);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <OtpInput label={dict.auth.twoFactor.codeLabel} autoFocus={false} invalid={!!state?.error} />
      <SubmitButton variant="secondary">{label}</SubmitButton>
    </form>
  );
}
