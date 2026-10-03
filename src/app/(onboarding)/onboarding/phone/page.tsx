import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-shell";
import { StepProgress } from "@/components/auth/step-progress";
import { cooldownRemaining, usableCode } from "@/server/auth/codes";
import { maskPhone, onboardingProgress, requireSession } from "@/server/auth/dal";
import { smsEnabled } from "@/server/env";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { PhoneFlow } from "./phone-flow";

export const metadata: Metadata = { title: "Verify your phone" };

export default async function VerifyPhonePage() {
  const { user } = await requireSession("/onboarding/phone");
  if (!user.emailVerifiedAt) redirect("/onboarding/email");
  if (user.phoneVerifiedAt || !smsEnabled()) redirect("/onboarding/two-factor");

  const dict = await getDictionary();
  const a = dict.auth;
  const progress = onboardingProgress(a.steps, 2);
  // Resume at the code screen if a code was sent recently and is still valid.
  const pending = await usableCode(user.id, "PHONE_VERIFY");

  return (
    <>
      <StepProgress
        steps={progress.steps}
        current={progress.current}
        label={fmt(a.stepOf, { n: progress.current, total: progress.steps.length })}
      />
      <AuthHeading title={a.phone.title} subtitle={a.phone.subtitle} />
      <PhoneFlow
        pendingPhone={pending?.target ?? null}
        pendingPhoneMasked={pending ? maskPhone(pending.target) : null}
        initialCooldown={cooldownRemaining(pending)}
      />
    </>
  );
}
