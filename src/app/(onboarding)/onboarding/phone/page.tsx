import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-shell";
import { StepProgress } from "@/components/auth/step-progress";
import { cooldownRemaining, usableCode } from "@/server/auth/codes";
import { maskPhone, requireSession } from "@/server/auth/dal";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { PhoneFlow } from "./phone-flow";

export const metadata: Metadata = { title: "Verify your phone" };

export default async function VerifyPhonePage() {
  const { user } = await requireSession("/onboarding/phone");
  if (!user.emailVerifiedAt) redirect("/onboarding/email");
  if (user.phoneVerifiedAt) redirect("/onboarding/two-factor");

  const dict = await getDictionary();
  const a = dict.auth;
  // Resume at the code screen if a code was sent recently and is still valid.
  const pending = await usableCode(user.id, "PHONE_VERIFY");

  return (
    <>
      <StepProgress steps={a.steps} current={3} label={fmt(a.stepOf, { n: 3, total: a.steps.length })} />
      <AuthHeading title={a.phone.title} subtitle={a.phone.subtitle} />
      <PhoneFlow
        pendingPhone={pending?.target ?? null}
        pendingPhoneMasked={pending ? maskPhone(pending.target) : null}
        initialCooldown={cooldownRemaining(pending)}
      />
    </>
  );
}
