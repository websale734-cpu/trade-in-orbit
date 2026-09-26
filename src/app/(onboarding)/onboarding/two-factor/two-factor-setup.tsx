"use client";

import { useActionState, useRef, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { OtpInput } from "@/components/auth/otp-input";
import { useI18n } from "@/i18n/client";
import { enableTwoFactor, finishTwoFactor, skipTwoFactor } from "../actions";

/**
 * Authenticator setup. Shared by onboarding and Security settings: `allowSkip`
 * hides the skip link, and `doneAction` runs after the recovery codes are saved.
 */
export function TwoFactorSetup({
  qrDataUrl,
  manualKey,
  allowSkip = true,
  doneAction = finishTwoFactor,
}: {
  qrDataUrl: string;
  manualKey: string;
  allowSkip?: boolean;
  doneAction?: () => Promise<void>;
}) {
  const { dict } = useI18n();
  const t = dict.auth.twoFactor;
  const [state, action] = useActionState(enableTwoFactor, undefined);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (state?.recoveryCodes) {
    const text = state.recoveryCodes.join("\n");
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-xl border border-up/30 bg-up/10 p-3 text-sm">
          <Check className="h-5 w-5 shrink-0 text-up" />
          <span className="font-medium">2FA is on.</span>
        </div>
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <KeyRound className="h-4 w-4 text-accent" />
            {t.recoveryTitle}
          </h2>
          <p className="mt-1 text-sm text-muted">{t.recoveryBody}</p>
        </div>
        <ul className="tabular grid grid-cols-2 gap-2 rounded-xl border border-line bg-surface p-4 font-mono text-sm">
          {state.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(text).catch(() => {});
            setCopied(true);
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-line-strong py-3 text-sm font-medium hover:bg-surface"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? t.copied : t.copy}
        </button>
        <form action={doneAction}>
          <SubmitButton>{t.continue}</SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* White background so the QR code scans reliably in dark mode */}
        {/* eslint-disable-next-line @next/next/no-img-element -- data: URL generated server-side */}
        <img
          src={qrDataUrl}
          alt="QR code for your authenticator app"
          width={176}
          height={176}
          className="shrink-0 rounded-xl bg-white p-2"
        />
        <div className="text-sm">
          <p className="text-muted">{t.manual}</p>
          <code className="mt-2 block rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs break-all select-all">
            {manualKey}
          </code>
        </div>
      </div>

      <form ref={formRef} action={action} className="space-y-5">
        <FormMessage state={state} />
        <OtpInput
          label={t.codeLabel}
          autoFocus={false}
          invalid={!!state?.error}
          onComplete={() => formRef.current?.requestSubmit()}
        />
        <SubmitButton>{t.enable}</SubmitButton>
      </form>

      {allowSkip && (
        <form action={skipTwoFactor} className="text-center">
          <button type="submit" className="text-sm font-medium text-muted hover:text-fg">
            {t.skip}
          </button>
          <p className="mt-2 text-xs text-subtle">{t.skipNote}</p>
        </form>
      )}
    </div>
  );
}
