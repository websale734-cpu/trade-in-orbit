import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { TicketStatusBadge } from "@/components/support/status-badge";
import { MessageThread } from "@/components/support/message-thread";
import { ReplyForm } from "../ticket-form";

export const metadata: Metadata = { title: "Support conversation" };

export default async function TicketPage({ params }: PageProps<"/support/[id]">) {
  const { user } = await requireUser("/support");
  const { id } = await params;
  // Scoped to the owner: another customer's ticket id is a 404, not a 403, so ids can't be probed.
  const ticket = await db.supportTicket.findFirst({
    where: { id, userId: user.id },
    include: { messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } } },
  });
  if (!ticket) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/support" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Support
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight break-words sm:text-2xl">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-muted">
            {ticket.channel === "CHAT" ? "Live chat" : ticket.category} · opened <LocalTime date={ticket.createdAt.toISOString()} />
          </p>
        </div>
        <TicketStatusBadge status={ticket.status} customer />
      </div>
      <MessageThread
        messages={ticket.messages.map((m) => ({
          id: m.id,
          body: m.body,
          mine: !m.fromStaff,
          author: m.fromStaff ? `${m.author.name.split(/\s+/)[0]} · Orbtrade support` : "You",
          at: m.createdAt.toISOString(),
        }))}
      />
      {ticket.status === "CLOSED" ? (
        <p className="glass rounded-[var(--radius-card)] p-4 text-sm text-muted">
          This conversation is closed. <Link href="/support" className="text-accent hover:underline">Open a new ticket</Link> if you still need help.
        </p>
      ) : (
        <section className="glass rounded-[var(--radius-card)] p-5">
          {ticket.status === "RESOLVED" && <p className="mb-3 text-sm text-muted">Marked resolved. Replying reopens it.</p>}
          <ReplyForm ticketId={ticket.id} />
        </section>
      )}
    </div>
  );
}
