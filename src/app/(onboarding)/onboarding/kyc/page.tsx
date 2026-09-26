import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CircleCheck, Clock, ShieldAlert } from "lucide-react";
import { AuthHeading } from "@/components/auth/auth-shell";
import { StepProgress } from "@/components/auth/step-progress";
import { ButtonLink } from "@/components/ui/button";
import { ONBOARDING_PATHS, nextOnboardingStep, requireSession } from "@/server/auth/dal";
import { latestKycSubmission } from "@/server/kyc";
import { countryOptions } from "@/config/countries";
import { getDictionary, getLocale } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { KycForm } from "./kyc-form";

export const metadata: Metadata = { title: "Verify your identity" };

export default async function KycPage() {
  const { user } = await requireSession("/onboarding/kyc");
  const step = nextOnboardingStep(user);
  if (step) redirect(ONBOARDING_PATHS[step]);

  const [dict, locale, latest] = await Promise.all([getDictionary(), getLocale(), latestKycSubmission(user.id)]);
  const a = dict.auth;
  const k = a.kyc;
  const progress = <StepProgress steps={a.steps} current={5} label={fmt(a.stepOf, { n: 5, total: a.steps.length })} />;

  if (user.kycStatus === "PENDING" || user.kycStatus === "APPROVED") {
    const s = k.status[user.kycStatus];
    const Icon = user.kycStatus === "APPROVED" ? CircleCheck : Clock;
    return (
      <>
        {progress}
        <div className="py-4 text-center">
          <Icon
            className={
              user.kycStatus === "APPROVED"
                ? "mx-auto h-12 w-12 text-up"
                : "mx-auto h-12 w-12 animate-pulse-soft text-warn"
            }
          />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">{s.title}</h1>
          <p className="mt-2 text-sm text-muted">{s.body}</p>
          <ButtonLink href="/dashboard" size="lg" className="mt-8 w-full">
            {k.toDashboard}
          </ButtonLink>
        </div>
      </>
    );
  }

  return (
    <>
      {progress}
      <AuthHeading title={k.title} subtitle={k.subtitle} />
      {user.kycStatus === "REJECTED" && (
        <div className="mb-5 flex gap-3 rounded-xl border border-down/30 bg-down/10 p-3 text-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-down" />
          <div>
            <p className="font-semibold">{k.status.REJECTED.title}</p>
            <p className="mt-1 text-muted">{k.status.REJECTED.body}</p>
            {latest?.rejectionReason && (
              <p className="mt-2">
                <span className="font-medium">{k.reason}:</span> {latest.rejectionReason}
              </p>
            )}
          </div>
        </div>
      )}
      <KycForm countries={countryOptions(locale)} />
    </>
  );
}
