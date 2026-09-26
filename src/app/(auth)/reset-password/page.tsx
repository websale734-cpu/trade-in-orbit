import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-shell";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  if (!email) redirect("/forgot-password");
  const dict = await getDictionary();
  return (
    <>
      <AuthHeading title={dict.auth.reset.title} subtitle={fmt(dict.auth.reset.subtitle, { email })} />
      <ResetForm email={email} />
    </>
  );
}
