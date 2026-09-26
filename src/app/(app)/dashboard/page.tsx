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
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { user } = await requireUser("/dashboard");
  await ensureDefaultAccount(user.id);

  const [dict, rows, fx, watch, headlines, assets] = await Promise.all([
    getDictionary(),
    userHoldings(user.id),
    getFxRates(),
    db.watchlistItem.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    getHeadlines(6),
    db.asset.findMany({ where: { enabled: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const d = dict.app.dashboard;

  // Sum each asset across all of the user's accounts.
  const order = new Map(assets.map((a) => [a.code, a.sortOrder]));
  const totals = new Map<string, Holding>();
  for (const r of rows) {
    const prev = totals.get(r.assetCode);
    const sum = prev ? (Number(prev.balance) + Number(r.balance)).toString() : r.balance;
    totals.set(r.assetCode, {
      code: r.assetCode,
      name: r.assetName,
      balance: sum,
      sortOrder: order.get(r.assetCode) ?? 99,
    });
  }

  const chartAssets = trackedCoins.filter((c) => c.binanceSymbol).map((c) => ({ code: c.symbol, name: c.name }));
  const quick = [
    { href: "/deposit", label: d.quick.deposit, icon: ArrowDownToLine },
    { href: "/withdraw", label: d.quick.withdraw, icon: ArrowUpFromLine },
    { href: "/trade?side=buy", label: d.quick.buy, icon: Plus },
    { href: "/trade?side=sell", label: d.quick.sell, icon: Minus },
    { href: "/trade?side=swap", label: d.quick.swap, icon: ArrowLeftRight },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {fmt(d.welcome, { name: user.name.split(/\s+/)[0] })}
        </h1>
        <CurrencySelect current={user.currency} label={d.currency} />
      </div>

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
          <span className="inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap">
            {d.kycAction[user.kycStatus]}
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      )}

      <PortfolioSummary
        holdings={[...totals.values()]}
        currency={user.currency}
        fxRate={fx?.rates[user.currency] ?? null}
        labels={{
          total: d.totalBalance,
          change24h: d.change24h,
          breakdown: d.breakdown,
          empty: d.emptyPortfolio,
          unpriced: d.unpriced,
          other: d.other,
        }}
      />

      {/* Quick actions */}
      <nav aria-label="Quick actions" className="grid grid-cols-5 gap-2 sm:gap-3">
        {quick.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="glass group flex flex-col items-center gap-2 rounded-2xl px-1 py-4 text-xs font-medium transition-transform active:scale-95 sm:text-sm"
          >
            <span className="bg-brand grid h-11 w-11 place-items-center rounded-full text-white shadow-[0_8px_24px_-8px_var(--glow-violet)] transition-transform group-hover:-translate-y-0.5">
              <Icon className="h-5 w-5" />
            </span>
            {label}
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <PriceChart
          assets={chartAssets}
          initialAsset={watch.find((w) => chartAssets.some((c) => c.code === w.assetCode))?.assetCode ?? "BTC"}
        />
        <Watchlist
          codes={watch.map((w) => w.assetCode)}
          labels={{ title: d.watchlist, empty: d.watchlistEmpty, browse: d.browseMarkets }}
        />
      </div>

      {/* News */}
      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6" aria-label={d.news}>
        <h2 className="flex items-center gap-2 font-semibold">
          <Newspaper className="h-4 w-4 text-accent" />
          {d.news}
        </h2>
        {headlines.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{d.newsEmpty}</p>
        ) : (
          <ul className="mt-3 grid gap-x-8 divide-y divide-line md:grid-cols-2 md:divide-y-0">
            {headlines.map((h) => (
              <li key={h.url} className="md:border-b md:border-line">
                <a href={h.url} target="_blank" rel="noopener noreferrer nofollow" className="group block py-3">
                  <span className="line-clamp-2 text-sm font-medium group-hover:text-accent">{h.title}</span>
                  <span className="mt-1 block text-xs text-muted">
                    {h.source} · <LocalTime date={h.publishedAt} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-subtle">{d.newsNote}</p>
      </section>
    </div>
  );
}
