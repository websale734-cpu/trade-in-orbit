import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/server/admin/rbac";
import { db } from "@/server/db";
import { LocalTime } from "@/components/ui/local-time";
import { ActionForm } from "@/components/admin/action-form";
import { adminButton, adminInput } from "@/components/admin/styles";
import { TicketStatusBadge } from "@/components/support/status-badge";
import { MessageThread } from "@/components/support/message-thread";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { adminReply, adminTicketUpdate } from "../../support-actions";

export const metadata = { title: "Support ticket" };

export default async function AdminTicket({ params }: PageProps<"/admin/support/[id]">) {
  await requirePermission("support.manage");
  const { id } = await params;
  const t = await db.supportTicket.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true, kycStatus: true, status: true } },
      assignedTo: { select: { name: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
    },
  });
  if (!t) notFound();

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
      {t.channel === "CHAT" && t.status !== "CLOSED" && <AutoRefresh seconds={5} />}
      <div className="min-w-0 space-y-4">
        <Link href="/admin/support" className="text-sm text-muted hover:text-fg">
          ← Inbox
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 flex-1 text-xl font-semibold break-words">{t.subject}</h1>
          <TicketStatusBadge status={t.status} />
        </div>
        <MessageThread
          messages={t.messages.map((m) => ({
            id: m.id,
            body: m.body,
            mine: m.fromStaff,
            author: m.fromStaff ? m.author.name : `${m.author.name} (customer)`,
            at: m.createdAt.toISOString(),
          }))}
        />
        <section className="glass rounded-2xl p-4">
          <ActionForm action={adminReply}>
            <input type="hidden" name="ticketId" value={t.id} />
            <label htmlFor="body" className="block text-sm font-medium">
              Reply to customer
            </label>
            <textarea id="body" name="body" rows={4} maxLength={4000} className={`${adminInput} h-auto py-2`} />
            <p className="text-xs text-muted">Never ask for passwords or 2FA codes. The customer is notified in-app{t.channel === "TICKET" && " and by email"}.</p>
            <button type="submit" className={`${adminButton} bg-brand text-white`}>
              Send reply
            </button>
          </ActionForm>
        </section>
      </div>
      <aside className="space-y-4 text-sm">
        <section className="glass space-y-1 rounded-2xl p-4">
          <h2 className="font-semibold">Customer</h2>
          <Link href={`/admin/users/${t.user.id}`} className="block text-accent hover:underline">
            {t.user.email}
          </Link>
          <p className="text-muted">
            {t.user.name} · KYC {t.user.kycStatus.toLowerCase()} · {t.user.status.toLowerCase()}
          </p>
          <p className="text-muted">
            {t.channel === "CHAT" ? "Live chat" : t.category} · opened <LocalTime date={t.createdAt.toISOString()} />
          </p>
        </section>
        <section className="glass space-y-3 rounded-2xl p-4">
          <h2 className="font-semibold">Handling</h2>
          <p className="text-muted">Assigned: {t.assignedTo?.name ?? "nobody"}</p>
          <ActionForm action={adminTicketUpdate}>
            <input type="hidden" name="ticketId" value={t.id} />
            <input type="hidden" name="op" value={t.assignedTo ? "unassign" : "assign-me"} />
            <button type="submit" className={`${adminButton} border border-line`}>
              {t.assignedTo ? "Unassign" : "Assign to me"}
            </button>
          </ActionForm>
          <ActionForm action={adminTicketUpdate}>
            <input type="hidden" name="ticketId" value={t.id} />
            <input type="hidden" name="op" value="status" />
            <label htmlFor="status" className="block text-muted">
              Status
            </label>
            <select id="status" name="status" defaultValue={t.status} className={adminInput}>
              <option value="OPEN">Open</option>
              <option value="AWAITING_CUSTOMER">Awaiting customer</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
            <button type="submit" className={`${adminButton} border border-line`}>
              Update status
            </button>
          </ActionForm>
        </section>
      </aside>
    </div>
  );
}
