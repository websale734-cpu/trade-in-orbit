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
    <div className="mx-auto max-w-xl space-y-8">
      <PageIntro title={t.openTitle} intro={t.openIntro} back={{ href: "/accounts", label: t.allAccounts }} />
      <section className="glass rounded-[var(--radius-card)] p-6">
        <OpenAccountForm />
      </section>
    </div>
  );
}
