import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-shell";
import { StepProgress } from "@/components/auth/step-progress";
import { requireSession } from "@/server/auth/dal";
import { beginTotpSetup } from "@/server/auth/totp";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { TwoFactorSetup } from "./two-factor-setup";

export const metadata: Metadata = { title: "Two-factor authentication" };

export default async function TwoFactorPage() {
  const { user } = await requireSession("/onboarding/two-factor");
  if (!user.emailVerifiedAt) redirect("/onboarding/email");
  if (!user.phoneVerifiedAt) redirect("/onboarding/phone");
  if (user.totpEnabledAt || user.twoFactorPromptedAt) redirect("/onboarding/kyc");

  const dict = await getDictionary();
  const a = dict.auth;
  const setup = await beginTotpSetup(user.id, user.email, user.totpPendingSecretEnc);
  return (
    <>
      <StepProgress steps={a.steps} current={4} label={fmt(a.stepOf, { n: 4, total: a.steps.length })} />
      <AuthHeading title={a.twoFactor.title} subtitle={a.twoFactor.subtitle} />
      <TwoFactorSetup qrDataUrl={setup.qrDataUrl} manualKey={setup.manualKey} />
    </>
  );
}
