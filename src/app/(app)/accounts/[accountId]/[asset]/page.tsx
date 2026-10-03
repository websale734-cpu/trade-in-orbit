import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { CoinPriceTile, CoinValue } from "@/components/accounts/live-value";
import { AssetIcon, MoneyActions, PageIntro } from "@/components/accounts/page-parts";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { getMarketSnapshot } from "@/lib/market/coingecko";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { assetLabel, formatQty } from "@/lib/assets";

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
    <div className="mx-auto max-w-3xl space-y-10">
      <PageIntro
        title={assetLabel(code, asset.name)}
        icon={<AssetIcon code={code} src={image} size={44} />}
        intro={fmt(t.coin.inAccount, { account: account.name })}
        back={{ href: `/accounts/${account.id}`, label: account.name }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <section aria-labelledby="have-label" className="glass rounded-[var(--radius-card)] p-6">
          <p id="have-label" className="text-sm text-muted">
            {t.coin.youHave}
          </p>
          <CoinValue code={code} amount={balance} className="mt-1 block text-5xl font-semibold tracking-tight" />
          <p className="tabular mt-2 text-sm text-muted">
            {formatQty(balance, asset.decimals)} {code}
          </p>
        </section>
        <section className="glass rounded-[var(--radius-card)] p-6">
          {code === "USD" ? <p className="text-sm leading-relaxed text-muted">{t.coin.cashNote}</p> : <CoinPriceTile code={code} />}
        </section>
      </div>

      <MoneyActions labels={t.actions} context={{ account: account.id, asset: code }} />

      <section aria-labelledby="activity-heading" className="space-y-4">
        <h2 id="activity-heading" className="text-lg font-semibold">
          {t.coin.activity}
        </h2>
        {postings.length === 0 ? (
          <p className="glass rounded-[var(--radius-card)] p-6 text-sm text-muted">{t.coin.activityEmpty}</p>
        ) : (
          <ul className="glass divide-y divide-line rounded-[var(--radius-card)] px-5">
            {postings.map((p) => {
              const incoming = Number(p.amount) > 0;
              const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
              return (
                <li key={p.id} className="flex items-center gap-3 py-4 text-sm">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-strong">
                    <Icon className="h-4 w-4 text-muted" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.entryTypes[p.entry.type]}</span>
                    <span className="block truncate text-xs text-muted">
                      {p.entry.description} · <LocalTime date={p.createdAt.toISOString()} />
                    </span>
                  </span>
                  <span className="tabular font-medium whitespace-nowrap">
                    {incoming ? "+" : "−"}
                    {formatQty(Math.abs(Number(p.amount)), asset.decimals)} {code}
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
