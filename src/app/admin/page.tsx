import Link from "next/link";
import { BarChart } from "@/components/charts/bar-chart";
import { requirePermission } from "@/server/admin/rbac";
import { adminOverview } from "@/server/admin/stats";
import { formatMoney } from "@/config/currencies";

export const metadata = { title: "Overview" };

export default async function AdminOverview({ searchParams }: PageProps<"/admin">) {
  await requirePermission("users.view");
  const sp = await searchParams;
  const s = await adminOverview();
  const usd = (v: number) => formatMoney(v, "usd");

  const tiles = [
    { label: "Customers", value: s.users.toLocaleString(), sub: `+${s.newUsers} in 30 days` },
    { label: "Trading volume (30d)", value: usd(s.tradeVolume30d), sub: "Real accounts, filled orders" },
    { label: "Fee revenue (30d)", value: usd(s.revenue30d), sub: "Crypto fees at current prices" },
    { label: "Deposits (30d)", value: usd(s.deposits30d), sub: "Completed, excl. sandbox" },
    { label: "Withdrawals (30d)", value: usd(s.withdrawals30d), sub: "Completed, excl. sandbox" },
  ];
  const queues = [
    { label: "KYC to review", value: s.kycPending, href: "/admin/kyc" },
    { label: "Pending deposits", value: s.depPending, href: "/admin/deposits" },
    { label: "Withdrawals in progress", value: s.wdQueue, href: "/admin/withdrawals" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      {sp.denied && (
        <p className="rounded-xl border border-down/30 bg-down/10 p-3 text-sm" role="alert">
          Your role doesn&apos;t have access to that section.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {queues.map((q) => (
          <Link
            key={q.label}
            href={q.href}
            className="glass flex items-center justify-between rounded-2xl p-4 hover:bg-surface-strong"
          >
            <span className="text-sm text-muted">{q.label}</span>
            <span className={q.value ? "text-2xl font-semibold text-warn" : "text-2xl font-semibold"}>{q.value}</span>
          </Link>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="glass rounded-2xl p-4">
            <p className="text-xs text-muted">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{t.value}</p>
            <p className="mt-1 text-xs text-subtle">{t.sub}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass rounded-2xl p-5">
          <BarChart data={s.volumeDaily} label="Daily trading volume (USD)" unit="usd" />
        </section>
        <section className="glass rounded-2xl p-5">
          <BarChart data={s.signupsDaily} label="Daily sign-ups" unit="count" />
        </section>
      </div>
    </div>
  );
}
