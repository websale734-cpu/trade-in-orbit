import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileText, Search } from "lucide-react";
import { inputClasses } from "@/components/ui/form";
import { buttonClasses } from "@/components/ui/button";
import { requireUser } from "@/server/auth/dal";
import { statementMonths, userEntries } from "@/server/statements";
import { HistoryList, type HistoryRow } from "./history-list";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "History" };

const PAGE_SIZE = 25;
const TYPES = ["DEPOSIT", "WITHDRAWAL", "TRADE", "TRANSFER", "FEE", "REWARD", "ADJUSTMENT"] as const;
const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  TRADE: "Trade",
  TRANSFER: "Transfer",
  FEE: "Fee",
  REWARD: "Reward",
  ADJUSTMENT: "Adjustment",
  DEV_SEED: "Development funding",
};
/** Customer-facing heading for a row: admin credits carry their chosen label in metadata. */
function rowLabel(e: { type: string; metadata: Record<string, unknown> | null }): string {
  if (e.type === "ADJUSTMENT" && typeof e.metadata?.customerLabel === "string") return e.metadata.customerLabel;
  return TYPE_LABEL[e.type] ?? e.type;
}
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const { user } = await requireUser("/history");
  const sp = await searchParams;
  const tab = sp.tab === "statements" ? "statements" : "transactions";

  const tabs = (
    <div className="flex rounded-full border border-line bg-surface p-1 text-sm font-semibold" role="tablist">
      {(["transactions", "statements"] as const).map((t) => (
        <Link
          key={t}
          href={t === "transactions" ? "/history" : "/history?tab=statements"}
          role="tab"
          aria-selected={tab === t}
          className={cn("rounded-full px-4 py-1.5 capitalize", tab === t ? "bg-brand text-white" : "text-muted")}
        >
          {t === "statements" ? "Statements & tax" : "Transactions"}
        </Link>
      ))}
    </div>
  );

  if (tab === "statements") {
    const months = await statementMonths(user.id);
    const years = [...new Set(months.map((m) => Number(m.slice(0, 4))))];
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">History</h1>
          {tabs}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
            <h2 className="font-semibold">Monthly statements</h2>
            <p className="mt-1 text-sm text-muted">Opening and closing balances plus every transaction, as a PDF.</p>
            <ul className="mt-3 divide-y divide-line text-sm" data-testid="statements">
              {months.map((m) => (
                <li key={m} className="flex items-center justify-between py-2.5">
                  <span>
                    {new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", {
                      month: "long",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </span>
                  <a
                    href={`/history/statement/${m}`}
                    className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline"
                  >
                    <FileText className="h-4 w-4" /> PDF
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
            <h2 className="font-semibold">Tax report</h2>
            <p className="mt-1 text-sm text-muted">
              Every purchase, sale, swap and reward in a calendar year with its USD value at the time, for your tax
              adviser or tax software. This isn&apos;t tax advice.
            </p>
            <ul className="mt-3 divide-y divide-line text-sm">
              {years.map((y) => (
                <li key={y} className="flex items-center justify-between py-2.5">
                  <span>{y}</span>
                  <span className="flex gap-4">
                    <a href={`/history/tax?year=${y}&format=csv`} className="font-medium text-accent hover:underline">
                      CSV
                    </a>
                    <a href={`/history/tax?year=${y}&format=pdf`} className="font-medium text-accent hover:underline">
                      PDF
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    );
  }

  const type = TYPES.find((t) => t === sp.type);
  const q = str(sp.q).trim().slice(0, 80);
  const from = isDate(str(sp.from)) ? str(sp.from) : "";
  const to = isDate(str(sp.to)) ? str(sp.to) : "";
  const page = Math.max(1, Math.min(1000, Number.parseInt(str(sp.page)) || 1));
  const filter = {
    type,
    q: q || undefined,
    from: from ? new Date(`${from}T00:00:00Z`) : undefined,
    to: to ? new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000) : undefined,
  };
  const rows = await userEntries(user.id, filter, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE);
  const hasNext = rows.length > PAGE_SIZE;
  const historyRows: HistoryRow[] = rows.slice(0, PAGE_SIZE).map((e) => ({
    id: e.id,
    type: e.type,
    label: rowLabel(e),
    description: e.description,
    createdAt: e.createdAt.toISOString(),
    accounts: e.accounts,
    changes: e.changes,
  }));
  const params = new URLSearchParams(Object.entries({ type: type ?? "", q, from, to }).filter(([, v]) => v));
  const pageHref = (p: number) => `/history?${new URLSearchParams([...params, ["page", String(p)]])}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">History</h1>
        {tabs}
      </div>

      <form
        className="glass grid gap-3 rounded-[var(--radius-card)] p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]"
        role="search"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search descriptions"
            aria-label="Search"
            className={`${inputClasses} pl-10`}
          />
        </div>
        <select name="type" defaultValue={type ?? ""} aria-label="Type" className={inputClasses}>
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={from} aria-label="From date" className={inputClasses} />
        <input type="date" name="to" defaultValue={to} aria-label="To date" className={inputClasses} />
        <div className="flex gap-2">
          <button type="submit" className={buttonClasses({ size: "md", className: "h-12 flex-1" })}>
            Filter
          </button>
          <a
            href={`/history/export?${params}`}
            className={buttonClasses({ variant: "secondary", size: "md", className: "h-12" })}
            aria-label="Download CSV"
            title="Download CSV"
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
      </form>

      <section className="glass rounded-[var(--radius-card)] p-2 sm:p-4">
        <HistoryList rows={historyRows} />
      </section>

      <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
        {page > 1 ? (
          <Link href={pageHref(page - 1)} className="font-medium text-accent hover:underline">
            ← Newer
          </Link>
        ) : (
          <span />
        )}
        <span className="text-muted">Page {page}</span>
        {hasNext ? (
          <Link href={pageHref(page + 1)} className="font-medium text-accent hover:underline">
            Older →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
