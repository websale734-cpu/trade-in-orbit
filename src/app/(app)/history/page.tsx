import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileText, Search } from "lucide-react";
import { inputClasses } from "@/components/ui/form";
import { buttonClasses } from "@/components/ui/button";
import { requireUser } from "@/server/auth/dal";
import { statementMonths, userEntries } from "@/server/statements";
import { db } from "@/server/db";
import { depositOutcome } from "@/server/funding";
import { withdrawalOutcome } from "@/server/withdrawals";
import { formatQty } from "@/lib/assets";
import type { Deposit } from "@/generated/prisma/client";
import { HistoryList, type HistoryRow } from "./history-list";
import { EmptyState, PageHeader, PageStack, Panel, segmentedItem, segmentedWrap } from "@/components/app/ui";
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
    <div className={segmentedWrap} role="tablist">
      {(["transactions", "statements"] as const).map((t) => (
        <Link
          key={t}
          href={t === "transactions" ? "/history" : "/history?tab=statements"}
          role="tab"
          aria-selected={tab === t}
          className={cn(segmentedItem, tab === t ? "bg-brand text-white" : "text-muted hover:text-fg")}
        >
          {t === "statements" ? "Statements & tax" : "Transactions"}
        </Link>
      ))}
    </div>
  );
  const header = (
    <PageHeader
      title="History"
      subtitle="Every deposit, withdrawal, trade and transfer on your accounts. Tap a row for its full details."
      actions={tabs}
    />
  );

  if (tab === "statements") {
    const months = await statementMonths(user.id);
    const years = [...new Set(months.map((m) => Number(m.slice(0, 4))))];
    const rowLink =
      "inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:border-line-strong hover:bg-surface-strong";
    return (
      <PageStack>
        {header}
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <Panel
            title="Monthly statements"
            description="Opening and closing balances plus every transaction, as a PDF."
          >
            {months.length === 0 ? (
              <EmptyState icon={<FileText className="h-5 w-5" />} title="No statements yet." />
            ) : (
              <ul className="divide-y divide-line text-sm" data-testid="statements">
                {months.map((m) => (
                  <li key={m} className="flex items-center justify-between gap-3 py-3.5">
                    <span className="font-medium">
                      {new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", {
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </span>
                    <a href={`/history/statement/${m}`} className={rowLink}>
                      <FileText className="h-4 w-4" /> PDF
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel
            title="Tax report"
            description="Every purchase, sale, swap and reward in a calendar year with its USD value at the time, for your tax adviser or tax software. This isn't tax advice."
          >
            {years.length === 0 ? (
              <EmptyState icon={<FileText className="h-5 w-5" />} title="No tax years yet." />
            ) : (
              <ul className="divide-y divide-line text-sm">
                {years.map((y) => (
                  <li key={y} className="flex items-center justify-between gap-3 py-3.5">
                    <span className="font-medium">{y}</span>
                    <span className="flex flex-wrap justify-end gap-2">
                      <a href={`/history/tax?year=${y}&format=csv`} className={rowLink}>
                        CSV
                      </a>
                      <a href={`/history/tax?year=${y}&format=pdf`} className={rowLink}>
                        PDF
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </PageStack>
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
  // One row per ledger entry, plus deposits that haven't credited anything yet (Pending or Failed).
  // Fetch one extra entry before this page so its deposits can be slotted in by date.
  const skip = (page - 1) * PAGE_SIZE;
  const fetched = await userEntries(
    user.id,
    { ...filter, customerView: true },
    PAGE_SIZE + 1 + (skip > 0 ? 1 : 0),
    Math.max(0, skip - 1),
  );
  const newerBound = skip > 0 ? fetched[0]?.createdAt : undefined;
  const entries = skip > 0 ? fetched.slice(1) : fetched;
  const hasNext = entries.length > PAGE_SIZE;
  const rows = entries.slice(0, PAGE_SIZE);
  const olderBound = hasNext ? rows[rows.length - 1]?.createdAt : undefined;

  const depositIds = rows.flatMap((e) =>
    e.type === "DEPOSIT" && typeof e.metadata?.depositId === "string" ? [e.metadata.depositId] : [],
  );
  const holdIds = rows.filter((e) => e.type === "WITHDRAWAL").map((e) => e.id);
  const [credited, withdrawals, uncredited] = await Promise.all([
    depositIds.length ? db.deposit.findMany({ where: { id: { in: depositIds }, userId: user.id } }) : [],
    holdIds.length ? db.withdrawal.findMany({ where: { holdEntryId: { in: holdIds }, userId: user.id } }) : [],
    !type || type === "DEPOSIT"
      ? db.deposit.findMany({
          where: {
            userId: user.id,
            status: { not: "COMPLETED" },
            createdAt: {
              gte: [filter.from, olderBound].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0],
              lt: [filter.to, newerBound].filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0],
            },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        })
      : [],
  ]);
  const depositById = new Map(credited.map((d) => [d.id, d]));
  const withdrawalByHold = new Map(withdrawals.map((w) => [w.holdEntryId, w]));
  const qty = (v: { toString(): string }) => formatQty(v.toString());

  const depositRow = (d: Deposit, base?: Omit<HistoryRow, "status" | "details">): HistoryRow => ({
    id: base?.id ?? `deposit-${d.id}`,
    type: "DEPOSIT",
    label: "Deposit",
    description: `Deposit of ${qty(d.amount)} ${d.assetCode}${d.network ? ` on ${d.network}` : ""}`,
    createdAt: base?.createdAt ?? d.createdAt.toISOString(),
    accounts: base?.accounts ?? [],
    changes: base?.changes ?? [{ asset: d.assetCode, amount: Number(d.amount) }],
    status: depositOutcome(d.status),
    details: [
      ...(d.network ? ([["Network", d.network]] as [string, string][]) : []),
      ...(d.providerRef ? ([["Transaction ID", d.providerRef]] as [string, string][]) : []),
      ...(d.failureReason ? ([["Reason", d.failureReason]] as [string, string][]) : []),
      ["Deposit reference", d.reference],
    ],
  });

  const historyRows: HistoryRow[] = rows.map((e) => {
    const base = {
      id: e.id,
      type: e.type,
      label: rowLabel(e),
      description: e.description,
      createdAt: e.createdAt.toISOString(),
      accounts: e.accounts,
      changes: e.changes,
    };
    const dep = typeof e.metadata?.depositId === "string" ? depositById.get(e.metadata.depositId) : undefined;
    if (e.type === "DEPOSIT" && dep) return depositRow(dep, base);
    const w = e.type === "WITHDRAWAL" ? withdrawalByHold.get(e.id) : undefined;
    if (w) {
      const dest = w.destination as { masked?: string; address?: string; network?: string };
      const outcome = withdrawalOutcome(w.status);
      return {
        ...base,
        label: "Withdrawal",
        description: `Withdrawal of ${qty(w.amount)} ${w.assetCode}${dest.masked ? ` to ${dest.masked}` : ""}`,
        status: outcome,
        details: [
          ["Network fee", `${qty(w.fee)} ${w.assetCode}`],
          ...(dest.network ? ([["Network", dest.network]] as [string, string][]) : []),
          ...(dest.address ? ([["Wallet address", dest.address]] as [string, string][]) : []),
          ...(outcome === "FAILED"
            ? ([
                [
                  "Result",
                  `Rejected${w.rejectionReason ? `: ${w.rejectionReason}` : ""}. ${qty(w.amount.plus(w.fee))} ${w.assetCode} was returned to your balance.`,
                ],
              ] as [string, string][])
            : []),
        ],
      };
    }
    return base;
  });
  const qLower = q.toLowerCase();
  for (const d of uncredited) {
    const row = depositRow(d);
    if (qLower && ![row.description, d.reference, d.providerRef ?? ""].some((s) => s.toLowerCase().includes(qLower)))
      continue;
    historyRows.push(row);
  }
  historyRows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const params = new URLSearchParams(Object.entries({ type: type ?? "", q, from, to }).filter(([, v]) => v));
  const pageHref = (p: number) => `/history?${new URLSearchParams([...params, ["page", String(p)]])}`;
  const pager =
    "inline-flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-5 text-sm font-medium transition-colors hover:border-line-strong hover:bg-surface-strong";

  return (
    <PageStack>
      {header}

      <Panel title="Filter" aria-label="Filter transactions">
        <form className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto]" role="search">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search descriptions"
              aria-label="Search"
              className={`${inputClasses} pl-10`}
            />
          </div>
          <select
            name="type"
            defaultValue={type ?? ""}
            aria-label="Type"
            className={cn(inputClasses, "sm:col-span-2 lg:col-span-1")}
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted lg:sr-only">From</span>
            <input type="date" name="from" defaultValue={from} aria-label="From date" className={inputClasses} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted lg:sr-only">To</span>
            <input type="date" name="to" defaultValue={to} aria-label="To date" className={inputClasses} />
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-1 lg:self-end">
            <button
              type="submit"
              className={buttonClasses({ size: "md", className: "h-12 flex-1 lg:flex-none lg:px-6" })}
            >
              Filter
            </button>
            <a
              href={`/history/export?${params}`}
              className={buttonClasses({ variant: "secondary", size: "md", className: "h-12 w-12 shrink-0 px-0" })}
              aria-label="Download CSV"
              title="Download CSV"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>
        </form>
      </Panel>

      <Panel title="Transactions" bodyClassName="-mx-3 sm:-mx-4">
        <HistoryList rows={historyRows} />
      </Panel>

      <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Pagination">
        {page > 1 ? (
          <Link href={pageHref(page - 1)} className={pager}>
            ← Newer
          </Link>
        ) : (
          <span />
        )}
        <span className="text-muted">Page {page}</span>
        {hasNext ? (
          <Link href={pageHref(page + 1)} className={pager}>
            Older →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </PageStack>
  );
}
