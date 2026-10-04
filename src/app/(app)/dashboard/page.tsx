import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpFromLine,
  Minus,
  Newspaper,
  Plus,
  ShieldAlert,
} from "lucide-react";
import { PortfolioSummary, type Holding } from "@/components/dashboard/portfolio-summary";
import { Watchlist } from "@/components/dashboard/watchlist";
import { CurrencySelect } from "@/components/dashboard/currency-select";
import { ReviewCard } from "@/components/dashboard/review-card";
import { PriceChart } from "@/components/charts/price-chart";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { ensureDefaultAccount, userHoldings } from "@/server/ledger";
import { getHeadlines } from "@/server/news";
import { db } from "@/server/db";
import { getFxRates } from "@/lib/market/fx";
import { trackedCoins } from "@/config/coins";
import { getDictionary } from "@/i18n/server";
import { fmt } from "@/i18n/format";
import { PageHeader, PageStack, Panel } from "@/components/app/ui";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { user } = await requireUser("/dashboard");
  await ensureDefaultAccount(user.id);

  const [dict, rows, fx, watch, headlines, assets, review] = await Promise.all([
    getDictionary(),
    userHoldings(user.id),
    getFxRates(),
    db.watchlistItem.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    getHeadlines(6),
    db.asset.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } }),
    db.testimonial.findFirst({
      where: { userId: user.id, status: { in: ["PENDING", "APPROVED"] } },
      select: { status: true },
    }),
  ]);
  const d = dict.app.dashboard;

  // Sum each asset across all of the user's accounts.
  const order = new Map(assets.map((a) => [a.code, a.sortOrder]));
  const totals = new Map<string, Holding>();
  // For each coin, link to the account that holds the most of it (most users have one).
  const bestAccount = new Map<string, { accountId: string; bal: number }>();
  for (const r of rows) {
    const prev = totals.get(r.assetCode);
    const sum = prev ? (Number(prev.balance) + Number(r.balance)).toString() : r.balance;
    totals.set(r.assetCode, {
      code: r.assetCode,
      name: r.assetName,
      balance: sum,
      sortOrder: order.get(r.assetCode) ?? 99,
    });
    const bal = Number(r.balance);
    const cur = bestAccount.get(r.assetCode);
    if (!cur || bal > cur.bal) bestAccount.set(r.assetCode, { accountId: r.accountId, bal });
  }
  const linkByAsset: Record<string, string> = {};
  for (const [code, v] of bestAccount) linkByAsset[code] = `/accounts/${v.accountId}/${code}`;

  const chartAssets = trackedCoins.filter((c) => c.binanceSymbol).map((c) => ({ code: c.symbol, name: c.name }));
  const quick = [
    { href: "/deposit", label: d.quick.deposit, icon: ArrowDownToLine },
    { href: "/withdraw", label: d.quick.withdraw, icon: ArrowUpFromLine },
    { href: "/trade?side=buy", label: d.quick.buy, icon: Plus },
    { href: "/trade?side=sell", label: d.quick.sell, icon: Minus },
    { href: "/trade?side=swap", label: d.quick.swap, icon: ArrowLeftRight },
  ];

  return (
    <PageStack>
      <PageHeader
        title={fmt(d.welcome, { name: user.name.split(/\s+/)[0] })}
        actions={<CurrencySelect current={user.currency} label={d.currency} />}
      />

      {user.kycStatus !== "APPROVED" && (
        <Link
          href="/onboarding/kyc"
          className={cn(
            "flex flex-col gap-3 rounded-[var(--radius-card)] border p-5 transition-colors sm:flex-row sm:items-center sm:gap-4",
            user.kycStatus === "REJECTED" ? "border-down/40 bg-down/10" : "border-warn/40 bg-warn/10",
          )}
        >
          <span className="flex items-start gap-3 sm:flex-1 sm:items-center">
            <ShieldAlert
              className={cn("h-5 w-5 shrink-0", user.kycStatus === "REJECTED" ? "text-down" : "text-warn")}
            />
            <span className="text-sm leading-relaxed">{d.kycBanner[user.kycStatus]}</span>
          </span>
          <span className="inline-flex items-center gap-1 self-start text-sm font-semibold whitespace-nowrap sm:self-auto">
            {d.kycAction[user.kycStatus]}
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      <PortfolioSummary
        holdings={[...totals.values()]}
        currency={user.currency}
        fxRate={fx?.rates[user.currency] ?? null}
        linkByAsset={linkByAsset}
        labels={{
          total: d.totalBalance,
          change24h: d.change24h,
          breakdown: d.breakdown,
          empty: d.emptyPortfolio,
          unpriced: d.unpriced,
          other: d.other,
          show: d.showBalance,
          hide: d.hideBalance,
          assets: d.assets,
          dayChange: d.dayChange,
          cash: d.cash,
          cashHint: d.cashHint,
        }}
        between={
          // Quick actions sit right under the balance, each in its own tile.
          <nav aria-label="Quick actions" className="grid grid-cols-5 gap-1.5 sm:gap-4">
            {quick.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="glass group flex min-w-0 flex-col items-center gap-2.5 rounded-2xl px-0.5 py-4 text-center text-xs font-medium transition-transform active:scale-95 sm:py-5 sm:text-sm"
              >
                <span className="bg-brand grid h-11 w-11 place-items-center rounded-full text-white shadow-[0_8px_24px_-8px_var(--glow-violet)] transition-transform group-hover:-translate-y-0.5 sm:h-12 sm:w-12">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="w-full truncate">{label}</span>
              </Link>
            ))}
          </nav>
        }
      />

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <PriceChart
            assets={chartAssets}
            initialAsset={watch.find((w) => chartAssets.some((c) => c.code === w.assetCode))?.assetCode ?? "BTC"}
          />
        </div>
        <div className="min-w-0">
          <Watchlist
            codes={watch.map((w) => w.assetCode)}
            labels={{ title: d.watchlist, empty: d.watchlistEmpty, browse: d.browseMarkets }}
          />
        </div>
      </div>

      <Panel
        aria-label={d.news}
        title={
          <span className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-accent" />
            {d.news}
          </span>
        }
        description={d.newsNote}
      >
        {headlines.length === 0 ? (
          <p className="text-sm text-muted">{d.newsEmpty}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            {headlines.map((h) => (
              <li key={h.url} className="min-w-0">
                <a
                  href={h.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="group block h-full rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-strong"
                >
                  <span className="line-clamp-2 text-sm font-medium group-hover:text-accent">{h.title}</span>
                  <span className="mt-2 block text-xs text-muted">
                    {h.source} · <LocalTime date={h.publishedAt} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ReviewCard existing={(review?.status as "PENDING" | "APPROVED" | undefined) ?? null} />
    </PageStack>
  );
}
