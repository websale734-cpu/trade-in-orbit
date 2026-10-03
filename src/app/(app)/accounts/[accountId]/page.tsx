import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { CoinValue, LiveValue } from "@/components/accounts/live-value";
import { AssetIcon, MoneyActions, PageIntro, focusRing } from "@/components/accounts/page-parts";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { getMarketSnapshot } from "@/lib/market/coingecko";
import { getDictionary } from "@/i18n/server";
import { assetLabel, formatQty } from "@/lib/assets";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({ params }: PageProps<"/accounts/[accountId]">) {
  const { user } = await requireUser("/accounts");
  const { accountId } = await params;
  const [dict, account, snapshot] = await Promise.all([
    getDictionary(),
    // Scoped to the signed-in user: another user's account ID is simply not found.
    db.account.findFirst({
      where: { id: accountId, userId: user.id, archivedAt: null, type: { not: "DEMO" } },
      include: { ledgerAccounts: { where: { balance: { not: 0 } }, include: { asset: true } } },
    }),
    getMarketSnapshot(),
  ]);
  if (!account) notFound();
  const t = dict.app.accounts;

  const tickers = new Map(snapshot.tickers.map((x) => [x.symbol, x]));
  const usd = (code: string, amount: number) => amount * (code === "USD" ? 1 : (tickers.get(code)?.priceUsd ?? 0));
  // Biggest holdings first. Ordered once here so rows don't reshuffle as prices move.
  const coins = [...account.ledgerAccounts].sort(
    (a, b) => usd(b.assetCode, Number(b.balance)) - usd(a.assetCode, Number(a.balance)),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageIntro title={account.name} intro={t.typeHints[account.type]} back={{ href: "/accounts", label: t.allAccounts }} />

      <section aria-labelledby="value-label" className="glass rounded-[var(--radius-card)] p-6 sm:p-8">
        <p id="value-label" className="text-sm font-medium text-muted">
          {t.accountValue}
        </p>
        <LiveValue
          holdings={coins.map((l) => ({ code: l.assetCode, amount: l.balance.toString() }))}
          className="mt-2 block text-5xl font-semibold tracking-tight"
        />
        <p className="mt-3 text-sm text-muted">{t.liveNote}</p>
      </section>

      <MoneyActions labels={t.actions} context={{ account: account.id }} />

      <section aria-labelledby="coins-heading" className="space-y-4">
        <h2 id="coins-heading" className="text-lg font-semibold">
          {t.yourCoins}
        </h2>
        {coins.length === 0 ? (
          <div className="glass rounded-[var(--radius-card)] p-6 text-center sm:p-8">
            <p className="font-medium">{t.noCoins}</p>
            <p className="mt-1 text-sm text-muted">{t.noCoinsHint}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/deposit">{t.actions.deposit}</ButtonLink>
              <ButtonLink href={`/transfer?to=${account.id}`} variant="secondary">
                {t.actions.transfer}
              </ButtonLink>
            </div>
          </div>
        ) : (
          <ul className="glass divide-y divide-line overflow-hidden rounded-[var(--radius-card)]">
            {coins.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/accounts/${account.id}/${l.assetCode}`}
                  className={cn("flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-strong", focusRing)}
                >
                  <AssetIcon code={l.assetCode} src={tickers.get(l.assetCode)?.image ?? null} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{assetLabel(l.assetCode, l.asset.name)}</span>
                    <span className="tabular block truncate text-sm text-muted">
                      {formatQty(l.balance.toString(), l.asset.decimals)} {l.assetCode}
                    </span>
                  </span>
                  <CoinValue code={l.assetCode} amount={l.balance.toString()} className="text-right font-semibold" />
                  <ChevronRight className="h-5 w-5 shrink-0 text-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
