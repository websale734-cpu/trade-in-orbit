"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { Field, FormMessage, SubmitButton } from "@/components/ui/form";
import { OtpInput } from "@/components/auth/otp-input";
import { useI18n } from "@/i18n/client";
import { verifyLoginTwoFactor } from "../../actions";

export function VerifyForm({ next }: { next: string | null }) {
  const { dict } = useI18n();
  const t = dict.auth.twoFactorLogin;
  const [state, action] = useActionState(verifyLoginTwoFactor, undefined);
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="space-y-5">
      <FormMessage state={state} />
      <input type="hidden" name="mode" value={mode} />
      {next && <input type="hidden" name="next" value={next} />}
      {mode === "totp" ? (
        <OtpInput
          label={dict.auth.twoFactor.codeLabel}
          invalid={!!state?.error}
          onComplete={() => formRef.current?.requestSubmit()}
        />
      ) : (
        <Field
          label={t.recoveryLabel}
          name="recovery"
          autoComplete="one-time-code"
          placeholder="abcde-12345"
          autoFocus
          required
        />
      )}
      <SubmitButton>{t.submit}</SubmitButton>
      <div className="flex flex-col items-center gap-2 text-sm">
        <button
          type="button"
          className="font-medium text-accent hover:underline"
          onClick={() => setMode(mode === "totp" ? "recovery" : "totp")}
        >
          {mode === "totp" ? t.useRecovery : t.useApp}
        </button>
        <Link href="/login" className="text-muted hover:text-fg">
          {t.back}
        </Link>
      </div>
    </form>
  );
}
