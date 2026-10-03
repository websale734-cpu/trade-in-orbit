import Link from "next/link";
import { ChevronRight, Landmark, PiggyBank, ShieldCheck } from "lucide-react";
import { LiveValue, type Holding } from "@/components/accounts/live-value";
import { MoneyActions, PageIntro, focusRing } from "@/components/accounts/page-parts";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/server/auth/dal";
import { ensureDefaultAccount, listAccounts, MAX_ACCOUNTS_PER_USER } from "@/server/ledger";
import { getDictionary } from "@/i18n/server";
import { cn } from "@/lib/utils";

/**
 * The Accounts home: one total, one simple card per account (name and value
 * only), and the four money actions. Coins live on each account's own page.
 */
export async function AccountsOverview() {
  const { user } = await requireUser("/accounts");
  await ensureDefaultAccount(user.id);
  const [dict, accounts] = await Promise.all([getDictionary(), listAccounts(user.id)]);
  const t = dict.app.accounts;

  const holdingsOf = (a: (typeof accounts)[number]): Holding[] =>
    a.ledgerAccounts
      .filter((l) => !l.balance.isZero())
      .map((l) => ({ code: l.assetCode, amount: l.balance.toString() }));
  const all = accounts.flatMap(holdingsOf);

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageIntro title={t.title} intro={t.overviewSubtitle} />

      <section
        aria-labelledby="total-label"
        className="glass ring-brand relative overflow-hidden rounded-[var(--radius-card)] p-6 sm:p-8"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-28 -right-20 h-72 w-72 rounded-full bg-accent-violet/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-64 w-64 rounded-full bg-accent-cyan/10 blur-3xl"
        />
        <p id="total-label" className="relative text-sm font-medium text-muted">
          {t.totalBalance}
        </p>
        <LiveValue holdings={all} className="relative mt-2 block text-5xl font-semibold tracking-tight sm:text-6xl" />
        <p className="relative mt-3 text-sm text-muted">
          {t.totalCaption} · {t.liveNote}
        </p>
      </section>

      <MoneyActions labels={t.actions} />

      {user.kycStatus !== "APPROVED" && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
          <ShieldCheck className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span className="text-muted">{t.kycHint}</span>
          <Link href="/onboarding/kyc" className="font-medium text-accent hover:underline">
            {t.kycCta}
          </Link>
        </p>
      )}

      {all.length === 0 && (
        <section className="glass rounded-[var(--radius-card)] p-6 text-center sm:p-8">
          <h2 className="text-lg font-semibold">{t.emptyTitle}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{t.emptyBody}</p>
          <ButtonLink href="/deposit" className="mt-5">
            {t.firstDeposit}
          </ButtonLink>
        </section>
      )}

      <section aria-labelledby="accounts-heading" className="space-y-4">
        <h2 id="accounts-heading" className="text-lg font-semibold">
          {t.yourAccounts}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {accounts.map((a) => {
            const Icon = a.type === "SAVINGS" ? PiggyBank : Landmark;
            return (
              <li key={a.id}>
                <Link
                  href={`/accounts/${a.id}`}
                  className={cn(
                    "glass group flex items-center gap-4 rounded-[var(--radius-card)] p-5 transition-colors hover:bg-surface-strong",
                    focusRing,
                  )}
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-strong">
                    <Icon className="h-6 w-6 text-accent" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{a.name}</span>
                    <span className="block truncate text-xs text-muted">{t.typeHints[a.type]}</span>
                    <LiveValue holdings={holdingsOf(a)} className="mt-2 block text-xl font-semibold" />
                  </span>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Link href="/history" className="font-medium text-accent hover:underline">
          {t.viewActivity}
        </Link>
        {accounts.length < MAX_ACCOUNTS_PER_USER && (
          <Link href="/accounts/new" className="font-medium text-accent hover:underline">
            {t.openAnother}
          </Link>
        )}
      </div>
    </div>
  );
}
