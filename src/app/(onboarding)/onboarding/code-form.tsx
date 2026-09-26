"use client";

import { useActionState, useRef } from "react";
import { FormMessage, SubmitButton, type FormState } from "@/components/ui/form";
import { OtpInput } from "@/components/auth/otp-input";
import { useI18n } from "@/i18n/client";

/** A 6-digit code form that submits automatically once all digits are entered. */
export function CodeForm({
  action,
  submitLabel,
}: {
  action: (prev: FormState | undefined, fd: FormData) => Promise<FormState>;
  submitLabel: string;
}) {
  const { dict } = useI18n();
  const [state, formAction] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <FormMessage state={state} />
      <OtpInput
        label={dict.auth.code.label}
        invalid={!!state?.error}
        onComplete={() => formRef.current?.requestSubmit()}
      />
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
