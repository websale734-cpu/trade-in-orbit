import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-shell";
import { StepProgress } from "@/components/auth/step-progress";
import { ResendButton } from "@/components/auth/resend-button";
import { activeCode, cooldownRemaining } from "@/server/auth/codes";
import { maskEmail, onboardingProgress, requireSession } from "@/server/auth/dal";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { resendEmailCode, verifyEmail } from "../actions";
import { CodeForm } from "../code-form";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage() {
  const { user } = await requireSession("/onboarding/email");
  if (user.emailVerifiedAt) redirect("/onboarding/phone");

  const dict = await getDictionary();
  const a = dict.auth;
  const progress = onboardingProgress(a.steps, 1);
  const code = await activeCode(user.id, "EMAIL_VERIFY");
  return (
    <>
      <StepProgress
        steps={progress.steps}
        current={progress.current}
        label={fmt(a.stepOf, { n: progress.current, total: progress.steps.length })}
      />
      <AuthHeading title={a.email.title} subtitle={fmt(a.email.subtitle, { email: maskEmail(user.email) })} />
      <div className="space-y-5">
        <CodeForm action={verifyEmail} submitLabel={a.email.submit} />
        <ResendButton action={resendEmailCode} initialCooldown={cooldownRemaining(code)} />
      </div>
    </>
  );
}
