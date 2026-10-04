import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LifeBuoy, MessageCircle } from "lucide-react";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { SUPPORT_CATEGORIES } from "@/server/support";
import { TicketStatusBadge } from "@/components/support/status-badge";
import { OpenChatButton } from "@/components/support/chat-widget";
import { TicketForm } from "./ticket-form";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage() {
  const { user } = await requireUser("/support");
  const tickets = await db.supportTicket.findMany({
    where: { userId: user.id },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
  });

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Support</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Chat with us or open a ticket. Quick answers are in the{" "}
            <Link href="/help" className="text-accent hover:underline">
              help centre
            </Link>
            .
          </p>
        </div>
        <OpenChatButton />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="glass min-w-0 rounded-[var(--radius-card)] p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
            <LifeBuoy className="h-4 w-4 text-accent" /> New ticket
          </h2>
          <TicketForm categories={SUPPORT_CATEGORIES} />
        </section>
        <section className="glass min-w-0 rounded-[var(--radius-card)] p-5 sm:p-6">
          <h2 className="text-base font-semibold sm:text-lg">Your conversations</h2>
          {tickets.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No conversations yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line" data-testid="ticket-list">
              {tickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/support/${t.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-surface"
                  >
                    {t.channel === "CHAT" && (
                      <MessageCircle className="h-4 w-4 shrink-0 text-muted" aria-label="Chat" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.subject}</span>
                      <span className="block text-xs text-muted">
                        {t.category} · <LocalTime date={t.lastMessageAt.toISOString()} />
                      </span>
                    </span>
                    <TicketStatusBadge status={t.status} customer />
                    <ChevronRight className="h-4 w-4 text-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
