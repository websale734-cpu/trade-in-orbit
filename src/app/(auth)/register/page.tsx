import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-shell";
import { StepProgress } from "@/components/auth/step-progress";
import { getSession } from "@/server/auth/session";
import { onboardingProgress, postAuthDestination } from "@/server/auth/dal";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect(postAuthDestination(session.user));

  const dict = await getDictionary();
  const a = dict.auth;
  const progress = onboardingProgress(a.steps, 0);
  return (
    <>
      <StepProgress
        steps={progress.steps}
        current={progress.current}
        label={fmt(a.stepOf, { n: progress.current, total: progress.steps.length })}
      />
      <AuthHeading title={a.register.title} subtitle={a.register.subtitle} />
      <RegisterForm />
    </>
  );
}
