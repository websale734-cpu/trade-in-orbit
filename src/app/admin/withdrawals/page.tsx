import Link from "next/link";
import { requirePermission } from "@/server/admin/rbac";
import { db } from "@/server/db";
import { LocalTime } from "@/components/ui/local-time";
import { SandboxBadge } from "@/components/app/kyc-gate";
import { ActionForm, adminButton, adminInput } from "@/components/admin/action-form";
import { cn } from "@/lib/utils";
import { decideWithdrawal } from "../actions";

export const metadata = { title: "Withdrawals" };

const NEXT_LABEL: Record<string, string> = {
  REQUESTED: "Start review",
  UNDER_REVIEW: "Approve",
  APPROVED: "Mark sent",
  SENT: "Mark completed",
};

/** Withdrawal approvals: review -> approve -> send (with payout reference) -> complete, or reject with reason. */
export default async function AdminWithdrawals() {
  await requirePermission("payments.review");
  const queue = await db.withdrawal.findMany({
    where: { status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "SENT"] } },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, email: true, kycStatus: true } } },
    take: 50,
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Withdrawal approvals</h1>
      <p className="text-sm text-muted">
        Funds are already held. Rejecting returns them to the customer. You can&apos;t approve your own withdrawal.
      </p>
      {queue.length === 0 && <p className="glass rounded-2xl p-5 text-sm text-muted">No withdrawals in progress.</p>}
      <div className="space-y-3">
        {queue.map((w) => {
          const dest = w.destination as {
            masked?: string;
            holder?: string;
            bankName?: string;
            provider?: string;
            address?: string;
          };
          return (
            <section key={w.id} className="glass rounded-2xl p-4 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="rounded bg-warn/15 px-2 py-0.5 text-xs font-bold text-warn">
                  {w.status.replace("_", " ")}
                </span>
                <span className="tabular text-base font-semibold">
                  {Number(w.amount).toLocaleString("en-US", { maximumFractionDigits: 8 })} {w.assetCode}
                </span>
                <span className="text-muted">
                  {w.method.replace("_", " ")} → {dest.holder ?? dest.provider ?? ""} {dest.bankName ?? ""}{" "}
                  {dest.address ?? dest.masked}
                </span>
                {w.sandbox && <SandboxBadge />}
                <Link href={`/admin/users/${w.user.id}`} className="text-accent hover:underline">
                  {w.user.email}
                </Link>
                <span className="ml-auto text-xs text-muted">
                  <LocalTime date={w.createdAt.toISOString()} />
                  {w.scheduledFor && " · scheduled"}
                </span>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <ActionForm action={decideWithdrawal} className="flex flex-wrap items-start gap-2 space-y-0">
                  <input type="hidden" name="withdrawalId" value={w.id} />
                  <input type="hidden" name="decision" value="advance" />
                  {w.status === "APPROVED" && (
                    <input name="txRef" placeholder="Payout / tx reference" className={cn(adminInput, "flex-1")} />
                  )}
                  <button className={cn(adminButton, "bg-up/15 text-up")}>{NEXT_LABEL[w.status]}</button>
                </ActionForm>
                {w.status !== "SENT" && (
                  <ActionForm action={decideWithdrawal} className="flex flex-wrap items-start gap-2 space-y-0">
                    <input type="hidden" name="withdrawalId" value={w.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <input
                      name="reason"
                      placeholder="Reason shown to the customer"
                      className={cn(adminInput, "flex-1")}
                    />
                    <button className={cn(adminButton, "bg-down/15 text-down")}>Reject</button>
                  </ActionForm>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
