import { cn } from "@/lib/utils";

const LABELS = {
  OPEN: ["Open", "Waiting for support"],
  AWAITING_CUSTOMER: ["Awaiting customer", "Support replied"],
  RESOLVED: ["Resolved", "Resolved"],
  CLOSED: ["Closed", "Closed"],
} as const;

const STYLES = {
  OPEN: "bg-accent/15 text-accent",
  AWAITING_CUSTOMER: "bg-warn/15 text-warn",
  RESOLVED: "bg-up/15 text-up",
  CLOSED: "bg-surface-strong text-muted",
} as const;

/** Ticket status with wording for the audience (staff vs customer). */
export function TicketStatusBadge({ status, customer }: { status: keyof typeof LABELS; customer?: boolean }) {
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap", STYLES[status])}>
      {LABELS[status][customer ? 1 : 0]}
    </span>
  );
}
