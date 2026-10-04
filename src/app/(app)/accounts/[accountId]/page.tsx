import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { CoinValue, LiveValue } from "@/components/accounts/live-value";
import { AssetIcon, MoneyActions, PageIntro, focusRing } from "@/components/accounts/page-parts";
import { PageStack, Panel } from "@/components/app/ui";
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
    <PageStack>
      <PageIntro
        title={account.name}
        intro={t.typeHints[account.type]}
        back={{ href: "/accounts", label: t.allAccounts }}
      />

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="value-label"
          className="glass ring-brand flex min-w-0 flex-col justify-center rounded-[var(--radius-card)] p-6 sm:p-8"
        >
          <p id="value-label" className="text-sm font-medium text-muted">
            {t.accountValue}
          </p>
          <LiveValue
            holdings={coins.map((l) => ({ code: l.assetCode, amount: l.balance.toString() }))}
            className="tabular mt-2 block text-4xl font-semibold tracking-tight break-words sm:text-5xl"
          />
          <p className="mt-3 text-sm text-muted">{t.liveNote}</p>
        </section>
        <div className="min-w-0">
          <MoneyActions labels={t.actions} context={{ account: account.id }} compact />
        </div>
      </div>

      <Panel title={t.yourCoins} bodyClassName={coins.length ? "-mx-3 sm:-mx-4" : undefined}>
        {coins.length === 0 ? (
          <div className="py-4 text-center">
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
          <ul className="grid gap-1 xl:grid-cols-2 xl:gap-x-3">
            {coins.map((l) => (
              <li key={l.id} className="min-w-0">
                <Link
                  href={`/accounts/${account.id}/${l.assetCode}`}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3.5 transition-colors hover:bg-surface-strong sm:gap-4 sm:px-4",
                    focusRing,
                  )}
                >
                  <AssetIcon code={l.assetCode} src={tickers.get(l.assetCode)?.image ?? null} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{assetLabel(l.assetCode, l.asset.name)}</span>
                    <span className="tabular block truncate text-xs text-muted sm:text-sm">
                      {formatQty(l.balance.toString(), l.asset.decimals)} {l.assetCode}
                    </span>
                  </span>
                  <CoinValue
                    code={l.assetCode}
                    amount={l.balance.toString()}
                    className="tabular shrink-0 text-right font-semibold"
                  />
                  <ChevronRight className="h-5 w-5 shrink-0 text-subtle" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageStack>
  );
}
