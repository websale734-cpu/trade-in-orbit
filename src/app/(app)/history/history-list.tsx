"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronDown, Inbox } from "lucide-react";
import { LocalTime } from "@/components/ui/local-time";
import { EmptyState } from "@/components/app/ui";
import { cn } from "@/lib/utils";

export type HistoryRow = {
  id: string;
  type: string;
  /** Customer-facing heading (e.g. "Deposit", "Transfer received", "Trade"). */
  label: string;
  description: string;
  createdAt: string;
  accounts: string[];
  changes: { asset: string; amount: number }[];
};

const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 8 });

/** In, out or moved: drives the row icon and colour. */
function direction(row: HistoryRow): "in" | "out" | "move" {
  if (row.type === "TRANSFER" || row.changes.length > 1) return "move";
  return (row.changes[0]?.amount ?? 0) >= 0 ? "in" : "out";
}

function AmountLines({ row, className }: { row: HistoryRow; className?: string }) {
  return (
    <span className={cn("tabular block font-semibold", className)}>
      {row.changes.map((c) => (
        <span key={c.asset} className={cn("block", row.type !== "TRANSFER" && c.amount >= 0 && "text-up")}>
          {row.type === "TRANSFER" ? "" : c.amount >= 0 ? "+" : "−"}
          {qty(Math.abs(c.amount))} {c.asset}
        </span>
      ))}
    </span>
  );
}

/** Tappable transaction rows. Each expands in place to show its full details. */
export function HistoryList({ rows }: { rows: HistoryRow[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (rows.length === 0) return <EmptyState icon={<Inbox className="h-5 w-5" />} title="No transactions match." />;

  return (
    <ul className="space-y-1" data-testid="history-list">
      {rows.map((e) => {
        const isOpen = open === e.id;
        const dir = direction(e);
        const Icon = dir === "in" ? ArrowDownLeft : dir === "out" ? ArrowUpRight : ArrowLeftRight;
        return (
          <li key={e.id} className={cn("rounded-xl transition-colors", isOpen && "bg-surface")}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : e.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left text-sm transition-colors hover:bg-surface-strong sm:gap-4 sm:px-4"
            >
              <span
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                  dir === "in" && "bg-up/10 text-up",
                  dir === "out" && "bg-down/10 text-down",
                  dir === "move" && "bg-surface-strong text-muted",
                )}
                aria-hidden
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{e.label}</span>
                <span className="block truncate text-xs text-muted sm:text-sm">{e.description}</span>
              </span>
              <span className="shrink-0 text-right">
                <AmountLines row={e} />
                <span className="mt-0.5 block text-xs text-muted">
                  <LocalTime date={e.createdAt} />
                </span>
              </span>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-subtle transition-transform", isOpen && "rotate-180")}
                aria-hidden
              />
            </button>

            {isOpen && (
              <dl className="mx-3 mb-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 rounded-xl border border-line bg-bg-elevated/60 p-4 text-sm sm:mx-4">
                <dt className="text-muted">Type</dt>
                <dd className="font-medium">{e.label}</dd>

                <dt className="text-muted">Description</dt>
                <dd className="break-words">{e.description || "—"}</dd>

                {e.accounts.length > 0 && (
                  <>
                    <dt className="text-muted">Account</dt>
                    <dd>{e.accounts.join(", ")}</dd>
                  </>
                )}

                <dt className="text-muted">Amount</dt>
                <dd>{e.changes.length === 0 ? "—" : <AmountLines row={e} className="font-medium" />}</dd>

                <dt className="text-muted">Date</dt>
                <dd>
                  <LocalTime date={e.createdAt} />
                </dd>

                <dt className="text-muted">Reference</dt>
                <dd className="font-mono text-xs break-all text-muted">{e.id}</dd>
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}
