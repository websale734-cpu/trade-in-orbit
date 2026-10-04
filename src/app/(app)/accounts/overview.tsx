import Link from "next/link";
import { ChevronRight, History, Landmark, PiggyBank, Plus, ShieldCheck, Wallet } from "lucide-react";
import { LiveValue, type Holding } from "@/components/accounts/live-value";
import { MoneyActions, focusRing } from "@/components/accounts/page-parts";
import { PageHeader, PageStack, Panel } from "@/components/app/ui";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/server/auth/dal";
import { ensureDefaultAccount, listAccounts, MAX_ACCOUNTS_PER_USER } from "@/server/ledger";
import { getDictionary } from "@/i18n/server";
import { cn } from "@/lib/utils";

/**
 * The Accounts home: one total, the four money actions, and one card per
 * account (name and value only). Coins live on each account's own page.
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
  const canOpen = accounts.length < MAX_ACCOUNTS_PER_USER;

  const shortcut = cn(
    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors hover:bg-surface-strong",
    focusRing,
  );

  return (
    <PageStack>
      <PageHeader title={t.title} subtitle={t.overviewSubtitle} />

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <section
          aria-labelledby="total-label"
          className="glass ring-brand relative isolate min-w-0 overflow-hidden rounded-[var(--radius-card)] p-6 sm:p-8 lg:col-span-2"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-28 -right-20 -z-10 h-72 w-72 rounded-full bg-accent-violet/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 -left-16 -z-10 h-64 w-64 rounded-full bg-accent-cyan/10 blur-3xl"
          />
          <p id="total-label" className="flex items-center gap-2 text-sm font-medium text-muted">
            <Wallet className="h-4 w-4 text-accent" aria-hidden />
            {t.totalBalance}
          </p>
          <LiveValue
            holdings={all}
            className="tabular mt-3 block text-4xl font-semibold tracking-tight break-words sm:text-5xl lg:text-6xl"
          />
          <p className="mt-3 text-sm text-muted">
            {t.totalCaption} · {t.liveNote}
          </p>
        </section>

        <Panel className="flex flex-col" bodyClassName="-mx-3 flex flex-1 flex-col justify-center gap-1">
          <Link href="/history" className={shortcut}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-strong text-accent">
              <History className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex-1">{t.viewActivity}</span>
            <ChevronRight className="h-4 w-4 text-subtle" aria-hidden />
          </Link>
          {canOpen && (
            <Link href="/accounts/new" className={shortcut}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-strong text-accent">
                <Plus className="h-4 w-4" aria-hidden />
              </span>
              <span className="flex-1">{t.openAnother}</span>
              <ChevronRight className="h-4 w-4 text-subtle" aria-hidden />
            </Link>
          )}
        </Panel>
      </div>

      <MoneyActions labels={t.actions} />

      {user.kycStatus !== "APPROVED" && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-card)] border border-line bg-surface px-5 py-4 text-sm">
          <ShieldCheck className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          <span className="text-muted">{t.kycHint}</span>
          <Link href="/onboarding/kyc" className="font-medium text-accent hover:underline">
            {t.kycCta}
          </Link>
        </p>
      )}

      {all.length === 0 && (
        <Panel className="text-center">
          <h2 className="text-lg font-semibold">{t.emptyTitle}</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{t.emptyBody}</p>
          <ButtonLink href="/deposit" className="mt-5">
            {t.firstDeposit}
          </ButtonLink>
        </Panel>
      )}

      <section aria-labelledby="accounts-heading" className="space-y-4">
        <h2 id="accounts-heading" className="text-lg font-semibold">
          {t.yourAccounts}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
          {accounts.map((a) => {
            const Icon = a.type === "SAVINGS" ? PiggyBank : Landmark;
            return (
              <li key={a.id} className="min-w-0">
                <Link
                  href={`/accounts/${a.id}`}
                  className={cn(
                    "glass group flex h-full items-center gap-4 rounded-[var(--radius-card)] p-5 transition-colors hover:bg-surface-strong sm:p-6",
                    focusRing,
                  )}
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-strong">
                    <Icon className="h-6 w-6 text-accent" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{a.name}</span>
                    <span className="block truncate text-xs text-muted sm:text-sm">{t.typeHints[a.type]}</span>
                    <LiveValue holdings={holdingsOf(a)} className="tabular mt-2 block text-xl font-semibold" />
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
    </PageStack>
  );
}
