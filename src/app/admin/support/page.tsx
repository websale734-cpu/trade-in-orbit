import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { requirePermission } from "@/server/admin/rbac";
import { db } from "@/server/db";
import { LocalTime } from "@/components/ui/local-time";
import { TicketStatusBadge } from "@/components/support/status-badge";
import { cn } from "@/lib/utils";
import type { TicketStatus } from "@/generated/prisma/client";

export const metadata = { title: "Support inbox" };

const FILTERS: { key: string; label: string; statuses: TicketStatus[] }[] = [
  { key: "open", label: "Needs reply", statuses: ["OPEN"] },
  { key: "waiting", label: "Awaiting customer", statuses: ["AWAITING_CUSTOMER"] },
  { key: "done", label: "Resolved & closed", statuses: ["RESOLVED", "CLOSED"] },
];

export default async function AdminSupport({ searchParams }: PageProps<"/admin/support">) {
  const { user } = await requirePermission("support.manage");
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.key === sp.status) ?? FILTERS[0];
  const mine = sp.mine === "1";
  const [tickets, counts] = await Promise.all([
    db.supportTicket.findMany({
      where: { status: { in: filter.statuses }, ...(mine ? { assignedToId: user.id } : {}) },
      orderBy: { lastMessageAt: filter.key === "open" ? "asc" : "desc" },
      include: { user: { select: { email: true } }, assignedTo: { select: { name: true } } },
      take: 100,
    }),
    db.supportTicket.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (s: TicketStatus[]) => counts.filter((c) => s.includes(c.status)).reduce((n, c) => n + c._count, 0);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Support inbox</h1>
      <div className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/support?status=${f.key}${mine ? "&mine=1" : ""}`}
            className={cn("rounded-full border px-3 py-1.5", f.key === filter.key ? "border-accent bg-accent/10 text-fg" : "border-line text-muted")}
          >
            {f.label} ({count(f.statuses)})
          </Link>
        ))}
        <Link
          href={`/admin/support?status=${filter.key}${mine ? "" : "&mine=1"}`}
          className={cn("rounded-full border px-3 py-1.5", mine ? "border-accent bg-accent/10 text-fg" : "border-line text-muted")}
        >
          Assigned to me
        </Link>
      </div>
      {tickets.length === 0 ? (
        <p className="glass rounded-2xl p-5 text-sm text-muted">Nothing here.</p>
      ) : (
        <ul className="glass divide-y divide-line overflow-hidden rounded-2xl">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/support/${t.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-surface">
                {t.channel === "CHAT" && <MessageCircle className="h-4 w-4 text-accent" aria-label="Live chat" />}
                <span className="min-w-0 flex-1 truncate font-medium">{t.subject}</span>
                <span className="text-muted">{t.user.email}</span>
                <span className="text-xs text-muted">{t.assignedTo ? `→ ${t.assignedTo.name}` : "unassigned"}</span>
                <span className="text-xs text-muted">
                  <LocalTime date={t.lastMessageAt.toISOString()} />
                </span>
                <TicketStatusBadge status={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
