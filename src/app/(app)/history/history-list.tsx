"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { LocalTime } from "@/components/ui/local-time";
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

function Amounts({ row }: { row: HistoryRow }) {
  return (
    <div className="tabular text-right font-medium whitespace-nowrap">
      {row.changes.map((c) => (
        <p key={c.asset} className={row.type === "TRANSFER" ? "" : c.amount >= 0 ? "text-up" : ""}>
          {row.type === "TRANSFER" ? "" : c.amount >= 0 ? "+" : "−"}
          {qty(Math.abs(c.amount))} {c.asset}
        </p>
      ))}
    </div>
  );
}

/** Tappable transaction rows. Each expands in place to show its full details. */
export function HistoryList({ rows }: { rows: HistoryRow[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (rows.length === 0) return <p className="p-4 text-sm text-muted">No transactions match.</p>;

  return (
    <ul className="divide-y divide-line" data-testid="history-list">
      {rows.map((e) => {
        const isOpen = open === e.id;
        return (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : e.id)}
              aria-expanded={isOpen}
              className="flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left text-sm transition-colors hover:bg-surface/60"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {e.label}
                  {e.accounts.length > 0 && (
                    <span className="ml-2 text-xs font-normal text-muted">{e.accounts.join(", ")}</span>
                  )}
                </p>
                <p className="truncate text-xs text-muted">
                  {e.description} · <LocalTime date={e.createdAt} />
                </p>
              </div>
              <Amounts row={e} />
              <ChevronDown
                className={cn("mt-0.5 h-4 w-4 shrink-0 text-subtle transition-transform", isOpen && "rotate-180")}
                aria-hidden
              />
            </button>

            {isOpen && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-2 pb-4 pl-2 text-sm sm:pl-4">
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
                <dd className="tabular space-x-2">
                  {e.changes.length === 0
                    ? "—"
                    : e.changes.map((c) => (
                        <span key={c.asset} className={e.type === "TRANSFER" ? "" : c.amount >= 0 ? "text-up" : ""}>
                          {e.type === "TRANSFER" ? "" : c.amount >= 0 ? "+" : "−"}
                          {qty(Math.abs(c.amount))} {c.asset}
                        </span>
                      ))}
                </dd>

                <dt className="text-muted">Date</dt>
                <dd>
                  <LocalTime date={e.createdAt} />
                </dd>

                <dt className="text-muted">Reference</dt>
                <dd className="tabular font-mono text-xs break-all text-muted">{e.id}</dd>
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}
