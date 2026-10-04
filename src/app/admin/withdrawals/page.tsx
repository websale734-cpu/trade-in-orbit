import Link from "next/link";
import { requirePermission } from "@/server/admin/rbac";
import { db } from "@/server/db";
import { PENDING_WITHDRAWAL_STATUSES } from "@/server/withdrawals";
import { LocalTime } from "@/components/ui/local-time";
import { SandboxBadge } from "@/components/app/kyc-gate";
import { ActionForm } from "@/components/admin/action-form";
import { adminButton, adminInput } from "@/components/admin/styles";
import { cn } from "@/lib/utils";
import { decideWithdrawal } from "../actions";

export const metadata = { title: "Withdrawals" };

const qty = (v: { toString(): string }) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 8 });

/** Withdrawal approvals: every pending withdrawal from every user, approved or rejected in one step. */
export default async function AdminWithdrawals() {
  await requirePermission("payments.review");
  const queue = await db.withdrawal.findMany({
    where: { status: { in: PENDING_WITHDRAWAL_STATUSES } },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  const accounts = new Map(
    (
      await db.account.findMany({
        where: { id: { in: [...new Set(queue.map((w) => w.accountId))] } },
        select: { id: true, name: true },
      })
    ).map((a) => [a.id, a.name]),
  );

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Withdrawal approvals</h1>
      <p className="text-sm text-muted">
        {queue.length} pending. The amount (plus fee) is already held from the customer&apos;s balance. Approving keeps
        it deducted and shows the withdrawal as successful; rejecting returns it in full and shows it as failed. You
        can&apos;t decide on your own withdrawal.
      </p>
      {queue.length === 0 && <p className="glass rounded-2xl p-5 text-sm text-muted">No pending withdrawals.</p>}
      <div className="space-y-3">
        {queue.map((w) => {
          const dest = w.destination as {
            masked?: string;
            holder?: string;
            bankName?: string;
            provider?: string;
            address?: string;
          };
          const details: [string, React.ReactNode][] = [
            [
              "User",
              <Link key="u" href={`/admin/users/${w.user.id}`} className="text-accent hover:underline">
                {w.user.name} · {w.user.email}
              </Link>,
            ],
            ["Account", accounts.get(w.accountId) ?? "—"],
            ["Method", w.method.replace("_", " ")],
            [
              "Destination",
              <span key="d" className="break-all">
                {[dest.holder ?? dest.provider, dest.bankName, dest.address ?? dest.masked].filter(Boolean).join(" · ")}
              </span>,
            ],
            ["Fee", `${qty(w.fee)} ${w.assetCode}`],
            ["Total held", `${qty(w.amount.plus(w.fee))} ${w.assetCode}`],
            ["Requested", <LocalTime key="t" date={w.createdAt.toISOString()} />],
            ...(w.scheduledFor
              ? ([["Scheduled for", <LocalTime key="s" date={w.scheduledFor.toISOString()} />]] as [
                  string,
                  React.ReactNode,
                ][])
              : []),
            ["Reference", <span key="id" className="font-mono text-xs">{w.id}</span>],
          ];
          return (
            <section key={w.id} className="glass rounded-2xl p-4 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="rounded bg-warn/15 px-2 py-0.5 text-xs font-bold text-warn">PENDING</span>
                <span className="tabular text-base font-semibold">
                  {qty(w.amount)} {w.assetCode}
                </span>
                {w.sandbox && <SandboxBadge />}
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {details.map(([k, v]) => (
                  <div key={k} className="flex min-w-0 gap-2">
                    <dt className="w-28 shrink-0 text-muted">{k}</dt>
                    <dd className="min-w-0">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 grid gap-3 border-t border-line pt-3 md:grid-cols-2">
                <ActionForm action={decideWithdrawal} className="flex flex-wrap items-start gap-2 space-y-0">
                  <input type="hidden" name="withdrawalId" value={w.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <button className={cn(adminButton, "bg-up/15 text-up")}>Approve</button>
                </ActionForm>
                {w.status !== "SENT" && (
                  <ActionForm action={decideWithdrawal} className="flex flex-wrap items-start gap-2 space-y-0">
                    <input type="hidden" name="withdrawalId" value={w.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <input
                      name="reason"
                      maxLength={500}
                      placeholder="Reason shown to the customer (optional)"
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
