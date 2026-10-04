import type { Metadata } from "next";
import { PageIntro } from "@/components/accounts/page-parts";
import { requireUser } from "@/server/auth/dal";
import { getDictionary } from "@/i18n/server";
import { OpenAccountForm } from "../open-account-form";

export const metadata: Metadata = { title: "Open an account" };

export default async function OpenAccountPage() {
  await requireUser("/accounts/new");
  const t = (await getDictionary()).app.accounts;
  return (
    <div className="mx-auto w-full max-w-2xl min-w-0 space-y-6 sm:space-y-8">
      <PageIntro title={t.openTitle} intro={t.openIntro} back={{ href: "/accounts", label: t.allAccounts }} />
      <section className="glass min-w-0 rounded-[var(--radius-card)] p-5 sm:p-8">
        <OpenAccountForm />
      </section>
    </div>
  );
}
