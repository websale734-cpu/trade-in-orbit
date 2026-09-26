import Link from "next/link";
import { requirePermission } from "@/server/admin/rbac";
import { db } from "@/server/db";
import { LocalTime } from "@/components/ui/local-time";
import { adminInput } from "@/components/admin/action-form";
import type { EntryType, Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Transactions" };

const TYPES: EntryType[] = ["TRANSFER", "DEPOSIT", "WITHDRAWAL", "TRADE", "FEE", "ADJUSTMENT", "REWARD", "DEV_SEED"];
const PAGE = 50;

/** The full ledger: every journal entry with its postings, filterable by type and customer. */
export default async function AdminTransactions({ searchParams }: PageProps<"/admin/transactions">) {
  await requirePermission("transactions.view");
  const sp = await searchParams;
  const type = TYPES.includes(sp.type as EntryType) ? (sp.type as EntryType) : undefined;
  const email = typeof sp.email === "string" ? sp.email.trim().toLowerCase() : "";
  const page = Math.max(0, Number(sp.page) || 0);
  const where: Prisma.JournalEntryWhereInput = {
    ...(type ? { type } : {}),
    ...(email ? { user: { email: { contains: email } } } : {}),
  };

  const [entries, total] = await Promise.all([
    db.journalEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * PAGE,
      take: PAGE,
      include: {
        user: { select: { id: true, email: true } },
        postings: { include: { ledgerAccount: { select: { systemCode: true, account: { select: { name: true } } } } } },
      },
    }),
    db.journalEntry.count({ where }),
  ]);
  const qs = (p: number) =>
    `?${new URLSearchParams({ ...(type ? { type } : {}), ...(email ? { email } : {}), page: String(p) })}`;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Transaction log</h1>
      <form className="flex flex-wrap gap-2">
        <select name="type" defaultValue={type ?? ""} className={`${adminInput} w-44`} aria-label="Type">
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input
          name="email"
          defaultValue={email}
          placeholder="Customer email"
          className={`${adminInput} w-64`}
          aria-label="Customer email"
        />
        <button className="h-10 rounded-lg bg-surface-strong px-4 text-sm font-semibold">Filter</button>
      </form>
      <p className="text-xs text-muted">{total.toLocaleString()} entries</p>
      <div className="glass divide-y divide-line rounded-2xl text-sm">
        {entries.map((e) => (
          <details key={e.id} className="group p-3">
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
              <span className="w-24 text-xs font-bold">{e.type}</span>
              <span className="min-w-0 flex-1">{e.description}</span>
              {e.user && (
                <Link href={`/admin/users/${e.user.id}`} className="text-xs text-accent hover:underline">
                  {e.user.email}
                </Link>
              )}
              <span className="text-xs text-muted">
                <LocalTime date={e.createdAt.toISOString()} />
              </span>
            </summary>
            {e.reason && <p className="mt-2 text-xs text-warn">Reason: {e.reason}</p>}
            <table className="mt-2 w-full text-xs">
              <tbody>
                {e.postings.map((p) => (
                  <tr key={p.id} className="text-muted">
                    <td className="py-0.5">{p.ledgerAccount.account?.name ?? p.ledgerAccount.systemCode}</td>
                    <td className={`tabular text-right ${Number(p.amount) < 0 ? "text-down" : "text-up"}`}>
                      {Number(p.amount) > 0 ? "+" : ""}
                      {p.amount.toString()} {p.assetCode}
                    </td>
                    <td className="tabular text-right">bal {p.balanceAfter.toString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 font-mono text-[10px] text-subtle">{e.id}</p>
          </details>
        ))}
      </div>
      <div className="flex gap-3 text-sm">
        {page > 0 && (
          <Link href={qs(page - 1)} className="text-accent">
            ← Newer
          </Link>
        )}
        {(page + 1) * PAGE < total && (
          <Link href={qs(page + 1)} className="text-accent">
            Older →
          </Link>
        )}
      </div>
    </div>
  );
}
