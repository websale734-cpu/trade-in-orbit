import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-shell";
import { StepProgress } from "@/components/auth/step-progress";
import { getSession } from "@/server/auth/session";
import { postAuthDestination } from "@/server/auth/dal";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect(postAuthDestination(session.user));

  const dict = await getDictionary();
  const a = dict.auth;
  return (
    <>
      <StepProgress steps={a.steps} current={1} label={fmt(a.stepOf, { n: 1, total: a.steps.length })} />
      <AuthHeading title={a.register.title} subtitle={a.register.subtitle} />
      <RegisterForm />
    </>
  );
}
