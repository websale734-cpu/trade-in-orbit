import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Circle, ShieldAlert } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Phase 2 dashboard: welcome, KYC banner and account checklist.
 * Balances, charts, watchlist and quick actions arrive in Phase 3.
 */
export default async function DashboardPage() {
  const { user } = await requireUser("/dashboard");
  const dict = await getDictionary();
  const d = dict.app.dashboard;
  const firstName = user.name.split(/\s+/)[0];

  const checklist = [
    { label: d.items.email, done: !!user.emailVerifiedAt },
    { label: d.items.phone, done: !!user.phoneVerifiedAt },
    { label: d.items.twoFactor, done: !!user.totpEnabledAt, href: "/settings/security" },
    { label: d.items.kyc, done: user.kycStatus === "APPROVED", href: "/onboarding/kyc" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{fmt(d.welcome, { name: firstName })}</h1>

      {user.kycStatus !== "APPROVED" && (
        <Link
          href="/onboarding/kyc"
          className={cn(
            "flex items-center gap-3 rounded-2xl border p-4 transition-colors",
            user.kycStatus === "REJECTED" ? "border-down/40 bg-down/10" : "border-warn/40 bg-warn/10",
          )}
        >
          <ShieldAlert className={cn("h-5 w-5 shrink-0", user.kycStatus === "REJECTED" ? "text-down" : "text-warn")} />
          <span className="flex-1 text-sm">{d.kycBanner[user.kycStatus]}</span>
          <span className="inline-flex items-center gap-1 text-sm font-semibold">
            {d.kycAction[user.kycStatus]}
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <section className="glass rounded-[var(--radius-card)] p-6">
          <h2 className="font-semibold">{d.checklist}</h2>
          <ul className="mt-4 space-y-3">
            {checklist.map((item) => {
              const row = (
                <span className="flex items-center gap-3 text-sm">
                  {item.done ? (
                    <span className="bg-brand grid h-6 w-6 place-items-center rounded-full">
                      <Check className="h-3.5 w-3.5 text-white" />
                    </span>
                  ) : (
                    <Circle className="h-6 w-6 text-line-strong" />
                  )}
                  <span className={item.done ? "" : "text-muted"}>{item.label}</span>
                  {!item.done && item.href && <ArrowRight className="ml-auto h-4 w-4 text-muted" />}
                </span>
              );
              return (
                <li key={item.label}>
                  {!item.done && item.href ? (
                    <Link href={item.href} className="block rounded-lg hover:text-fg">
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="glass grid place-items-center rounded-[var(--radius-card)] p-8 text-center">
          <p className="max-w-sm text-sm text-muted">{d.comingSoon}</p>
        </section>
      </div>
    </div>
  );
}
