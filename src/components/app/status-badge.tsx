import { cn } from "@/lib/utils";

export type Outcome = "PENDING" | "SUCCESS" | "FAILED";

const STYLE: Record<Outcome, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-warn/15 text-warn" },
  SUCCESS: { label: "Success", className: "bg-up/15 text-up" },
  FAILED: { label: "Failed", className: "bg-down/15 text-down" },
};

export const outcomeLabel = (o: Outcome) => STYLE[o].label;

/** The only three states a customer sees for a deposit or withdrawal. */
export function StatusBadge({ outcome, className }: { outcome: Outcome; className?: string }) {
  return (
    <span className={cn("rounded px-2 py-0.5 text-xs font-bold", STYLE[outcome].className, className)}>
      {STYLE[outcome].label}
    </span>
  );
}
