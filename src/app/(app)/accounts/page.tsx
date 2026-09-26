import type { Metadata } from "next";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Landmark, PiggyBank } from "lucide-react";
import { AccountValue } from "@/components/accounts/account-value";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { ensureDefaultAccount, listAccounts, recentEntries } from "@/server/ledger";
import { getDictionary } from "@/i18n/server";
import { OpenAccountForm } from "./open-account-form";
import { TransferForm } from "./transfer-form";

export const metadata: Metadata = { title: "Accounts" };

/** Asset quantity with thousands separators, up to 8 decimals. */
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 8 });

export default async function AccountsPage() {
  const { user } = await requireUser("/accounts");
  await ensureDefaultAccount(user.id);
  const [dict, accounts, entries] = await Promise.all([
    getDictionary(),
    listAccounts(user.id),
    recentEntries(user.id, 15),
  ]);
  const t = dict.app.accounts;

  const forTransfer = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    balances: a.ledgerAccounts
      .filter((l) => !l.balance.isZero())
      .map((l) => ({ code: l.assetCode, amount: l.balance.toString(), decimals: l.asset.decimals })),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.subtitle}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map((a) => {
          const Icon = a.type === "SAVINGS" ? PiggyBank : Landmark;
          const balances = a.ledgerAccounts.filter((l) => !l.balance.isZero());
          return (
            <section key={a.id} className="glass rounded-[var(--radius-card)] p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-strong">
                  <Icon className="h-5 w-5 text-accent" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold">
                    {a.name}
                    {a.isDefault && (
                      <span className="ml-2 rounded-full bg-surface-strong px-2 py-0.5 text-xs font-medium text-muted">
                        {t.default}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-muted">{t.types[a.type]}</p>
                </div>
                <AccountValue balances={balances.map((l) => ({ code: l.assetCode, amount: l.balance.toString() }))} />
              </div>
              {balances.length === 0 ? (
                <p className="mt-4 text-sm text-muted">{t.empty}</p>
              ) : (
                <ul className="mt-4 divide-y divide-line text-sm">
                  {balances.map((l) => (
                    <li key={l.id} className="flex justify-between py-2">
                      <span className="font-medium">{l.assetCode}</span>
                      <span className="tabular text-muted">
                        {Number(l.balance).toLocaleString("en-US", { maximumFractionDigits: l.asset.decimals })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <ArrowLeftRight className="h-4 w-4 text-accent" />
            {t.transfer}
          </h2>
          {accounts.length < 2 ? (
            <p className="mt-3 text-sm text-muted">{t.needTwo}</p>
          ) : (
            <TransferForm accounts={forTransfer} />
          )}
        </section>
        <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
          <h2 className="font-semibold">{t.open}</h2>
          <OpenAccountForm />
        </section>
      </div>

      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
        <h2 className="font-semibold">{t.activity}</h2>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t.activityEmpty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {entries.map((e) => {
              // Show the user's side of each entry (their own accounts' postings).
              const mine = e.postings.filter((p) => p.ledgerAccount.account);
              const net = mine.reduce((s, p) => s + Number(p.amount), 0);
              const asset = mine[0]?.assetCode ?? "";
              const Icon = e.type === "TRANSFER" ? ArrowLeftRight : net >= 0 ? ArrowDownLeft : ArrowUpRight;
              return (
                <li key={e.id} className="flex items-center gap-3 py-3 text-sm">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-strong">
                    <Icon className="h-4 w-4 text-muted" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.entryTypes[e.type]}</p>
                    <p className="truncate text-xs text-muted">
                      {e.type === "TRANSFER"
                        ? mine
                            .sort((a, b) => Number(a.amount) - Number(b.amount))
                            .map((p) => p.ledgerAccount.account!.name)
                            .join(" → ")
                        : e.description}{" "}
                      · <LocalTime date={e.createdAt.toISOString()} />
                    </p>
                  </div>
                  <span className="tabular font-medium whitespace-nowrap">
                    {e.type === "TRANSFER"
                      ? `${qty(Math.abs(Number(mine.find((p) => Number(p.amount) > 0)?.amount ?? 0)))} ${asset}`
                      : `${net >= 0 ? "+" : "−"}${qty(Math.abs(net))} ${asset}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
