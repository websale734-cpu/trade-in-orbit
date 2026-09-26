import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-shell";
import { safeNext } from "@/server/auth/dal";
import { getDictionary } from "@/i18n/server";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Two-factor authentication" };

export default async function LoginVerifyPage({ searchParams }: PageProps<"/login/verify">) {
  // No pending challenge cookie means there's nothing to verify.
  if (!(await cookies()).has("orb_mfa")) redirect("/login");
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const dict = await getDictionary();
  return (
    <>
      <AuthHeading title={dict.auth.twoFactorLogin.title} subtitle={dict.auth.twoFactorLogin.subtitle} />
      <VerifyForm next={next} />
    </>
  );
}
