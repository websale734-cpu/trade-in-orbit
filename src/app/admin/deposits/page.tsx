import Link from "next/link";
import { requirePermission } from "@/server/admin/rbac";
import { db } from "@/server/db";
import { LocalTime } from "@/components/ui/local-time";
import { SandboxBadge } from "@/components/app/kyc-gate";
import { ActionForm } from "@/components/admin/action-form";
import { adminButton, adminInput } from "@/components/admin/styles";
import { cn } from "@/lib/utils";
import { decideDeposit } from "../actions";

export const metadata = { title: "Deposits" };

/** Deposits awaiting confirmation (e.g. bank transfers matched against the bank statement). */
export default async function AdminDeposits() {
  await requirePermission("payments.review");
  const [pending, recent] = await Promise.all([
    db.deposit.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true, email: true, id: true } } },
      take: 50,
    }),
    db.deposit.findMany({
      where: { status: { not: "PENDING" } },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true } } },
      take: 15,
    }),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Deposit confirmations</h1>
      <p className="text-sm text-muted">
        Confirm a deposit only after the funds have arrived (match the reference on the bank statement or the provider
        dashboard). Confirmation credits the customer immediately.
      </p>
      {pending.length === 0 && <p className="glass rounded-2xl p-5 text-sm text-muted">No pending deposits.</p>}
      <div className="space-y-3">
        {pending.map((d) => (
          <section key={d.id} className="glass rounded-2xl p-4 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="tabular text-base font-semibold">
                {Number(d.amount).toLocaleString("en-US", { maximumFractionDigits: 8 })} {d.assetCode}
              </span>
              <span className="text-muted">{d.method.replace("_", " ")}</span>
              <span className="font-mono text-xs">{d.reference}</span>
              {d.sandbox && <SandboxBadge />}
              <Link href={`/admin/users/${d.user.id}`} className="text-accent hover:underline">
                {d.user.email}
              </Link>
              <span className="ml-auto text-xs text-muted">
                <LocalTime date={d.createdAt.toISOString()} />
              </span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <ActionForm action={decideDeposit} className="flex flex-wrap items-start gap-2 space-y-0">
                <input type="hidden" name="depositId" value={d.id} />
                <input type="hidden" name="decision" value="confirm" />
                <input
                  name="providerRef"
                  placeholder="Bank / provider reference (optional)"
                  className={cn(adminInput, "flex-1")}
                />
                <button className={cn(adminButton, "bg-up/15 text-up")}>Confirm received</button>
              </ActionForm>
              <ActionForm action={decideDeposit} className="flex flex-wrap items-start gap-2 space-y-0">
                <input type="hidden" name="depositId" value={d.id} />
                <input type="hidden" name="decision" value="fail" />
                <input
                  name="reason"
                  placeholder="Reason (e.g. funds not received)"
                  className={cn(adminInput, "flex-1")}
                />
                <button className={cn(adminButton, "bg-down/15 text-down")}>Mark failed</button>
              </ActionForm>
            </div>
          </section>
        ))}
      </div>
      <section className="glass rounded-2xl p-5">
        <h2 className="font-semibold">Recently processed</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {recent.map((d) => (
            <li key={d.id} className="flex flex-wrap gap-x-3 py-2">
              <span className={cn("text-xs font-bold", d.status === "COMPLETED" ? "text-up" : "text-down")}>
                {d.status}
              </span>
              <span className="tabular">
                {Number(d.amount)} {d.assetCode}
              </span>
              <span className="font-mono text-xs text-muted">{d.reference}</span>
              <span className="text-muted">{d.user.email}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
