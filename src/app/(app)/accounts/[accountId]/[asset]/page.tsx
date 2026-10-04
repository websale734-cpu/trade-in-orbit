import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { CoinPriceTile, CoinValue } from "@/components/accounts/live-value";
import { AssetIcon, MoneyActions, PageIntro } from "@/components/accounts/page-parts";
import { PageStack, Panel } from "@/components/app/ui";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { getMarketSnapshot } from "@/lib/market/coingecko";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { assetLabel, formatQty } from "@/lib/assets";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Coin" };

export default async function CoinPage({ params }: PageProps<"/accounts/[accountId]/[asset]">) {
  const { user } = await requireUser("/accounts");
  const { accountId, asset: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const [dict, account, asset, ledger, snapshot] = await Promise.all([
    getDictionary(),
    db.account.findFirst({
      where: { id: accountId, userId: user.id, archivedAt: null, type: { not: "DEMO" } },
      select: { id: true, name: true },
    }),
    db.asset.findUnique({ where: { code } }),
    // Only read after the ownership check below passes.
    db.ledgerAccount.findFirst({ where: { accountId, assetCode: code, account: { userId: user.id } } }),
    getMarketSnapshot(),
  ]);
  if (!account || !asset) notFound();
  const t = dict.app.accounts;

  const postings = ledger
    ? await db.posting.findMany({
        where: { ledgerAccountId: ledger.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { entry: { select: { type: true, description: true } } },
      })
    : [];
  const balance = ledger?.balance.toString() ?? "0";
  const image = snapshot.tickers.find((x) => x.symbol === code)?.image ?? null;

  return (
    <PageStack>
      <PageIntro
        title={assetLabel(code, asset.name)}
        icon={<AssetIcon code={code} src={image} size={44} />}
        intro={fmt(t.coin.inAccount, { account: account.name })}
        back={{ href: `/accounts/${account.id}`, label: account.name }}
      />

      <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)]">
        <section aria-labelledby="have-label" className="glass ring-brand min-w-0 rounded-[var(--radius-card)] p-6">
          <p id="have-label" className="text-sm font-medium text-muted">
            {t.coin.youHave}
          </p>
          <CoinValue
            code={code}
            amount={balance}
            className="tabular mt-2 block text-4xl font-semibold tracking-tight break-words sm:text-5xl"
          />
          <p className="tabular mt-2 text-sm text-muted">
            {formatQty(balance, asset.decimals)} {code}
          </p>
        </section>
        <section className="glass min-w-0 rounded-[var(--radius-card)] p-6">
          {code === "USD" ? (
            <p className="text-sm leading-relaxed text-muted">{t.coin.cashNote}</p>
          ) : (
            <CoinPriceTile code={code} />
          )}
        </section>
        <div className="min-w-0 sm:col-span-2 xl:col-span-1">
          <MoneyActions labels={t.actions} context={{ account: account.id, asset: code }} compact />
        </div>
      </div>

      <Panel title={t.coin.activity}>
        {postings.length === 0 ? (
          <p className="text-sm text-muted">{t.coin.activityEmpty}</p>
        ) : (
          <ul className="divide-y divide-line">
            {postings.map((p) => {
              const incoming = Number(p.amount) > 0;
              const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
              return (
                <li key={p.id} className="flex items-center gap-3 py-3.5 text-sm sm:gap-4">
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                      incoming ? "bg-up/10 text-up" : "bg-down/10 text-down",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{t.entryTypes[p.entry.type]}</span>
                    <span className="block truncate text-xs text-muted sm:text-sm">{p.entry.description}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cn("tabular block font-semibold", incoming && "text-up")}>
                      {incoming ? "+" : "−"}
                      {formatQty(Math.abs(Number(p.amount)), asset.decimals)} {code}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      <LocalTime date={p.createdAt.toISOString()} />
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </PageStack>
  );
}
