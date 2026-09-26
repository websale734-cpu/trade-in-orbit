import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/auth-shell";
import { getDictionary } from "@/i18n/server";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage() {
  const dict = await getDictionary();
  return (
    <>
      <AuthHeading title={dict.auth.forgot.title} subtitle={dict.auth.forgot.subtitle} />
      <ForgotForm />
    </>
  );
}
