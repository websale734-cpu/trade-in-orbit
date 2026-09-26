import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-shell";
import { getSession } from "@/server/auth/session";
import { postAuthDestination, safeNext } from "@/server/auth/dal";
import { getDictionary } from "@/i18n/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === "string" ? sp.next : null);
  const session = await getSession();
  if (session) redirect(postAuthDestination(session.user, next));

  const dict = await getDictionary();
  const notice = sp.reset === "1" ? "Your password was reset. Log in with your new password." : null;
  return (
    <>
      <AuthHeading title={dict.auth.login.title} subtitle={dict.auth.login.subtitle} />
      <LoginForm next={next} notice={notice} />
    </>
  );
}
