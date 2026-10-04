import Link from "next/link";
import { requirePermission } from "@/server/admin/rbac";
import { db } from "@/server/db";
import { depositOutcome } from "@/server/funding";
import { LocalTime } from "@/components/ui/local-time";
import { SandboxBadge } from "@/components/app/kyc-gate";
import { StatusBadge } from "@/components/app/status-badge";
import { ActionForm } from "@/components/admin/action-form";
import { adminButton, adminInput } from "@/components/admin/styles";
import { cn } from "@/lib/utils";
import { decideDeposit } from "../actions";

export const metadata = { title: "Deposits" };

const qty = (v: { toString(): string }) => Number(v).toLocaleString("en-US", { maximumFractionDigits: 8 });

/** Deposit approvals: customers report what they sent; staff check the wallet, then approve or reject. */
export default async function AdminDeposits() {
  await requirePermission("payments.review");
  const [pending, recent] = await Promise.all([
    db.deposit.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true, email: true, id: true } } },
      take: 100,
    }),
    db.deposit.findMany({
      where: { status: { not: "PENDING" } },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true, id: true } } },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Deposit approvals</h1>
      <p className="text-sm text-muted">
        {pending.length} pending. Check the platform wallet for the coin and network shown and confirm the amount
        arrived (the transaction ID helps when the customer gave one). Approving adds the amount to the customer&apos;s
        coin balance and shows the deposit as successful; rejecting credits nothing and shows it as failed. The customer
        is emailed either way. You can&apos;t decide on your own deposit.
      </p>
      {pending.length === 0 && <p className="glass rounded-2xl p-5 text-sm text-muted">No pending deposits.</p>}
      <div className="space-y-3">
        {pending.map((d) => {
          const details: [string, React.ReactNode][] = [
            [
              "User",
              <Link key="u" href={`/admin/users/${d.user.id}`} className="text-accent hover:underline">
                {d.user.name} · {d.user.email}
              </Link>,
            ],
            ["Coin", d.assetCode],
            ["Network", d.network ?? "—"],
            [
              "Sent to",
              <span key="a" className="font-mono text-xs break-all">
                {d.walletAddress ?? "—"}
              </span>,
            ],
            [
              "Transaction ID",
              <span key="tx" className="font-mono text-xs break-all">
                {d.providerRef ?? "Not provided"}
              </span>,
            ],
            ...(Number(d.fee) > 0 ? ([["Fee", `${qty(d.fee)} ${d.assetCode}`]] as [string, React.ReactNode][]) : []),
            ["Submitted", <LocalTime key="t" date={d.createdAt.toISOString()} />],
            [
              "Reference",
              <span key="r" className="font-mono text-xs">
                {d.reference}
              </span>,
            ],
          ];
          return (
            <section key={d.id} className="glass rounded-2xl p-4 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusBadge outcome="PENDING" />
                <span className="tabular text-base font-semibold">
                  {qty(d.amount)} {d.assetCode}
                </span>
                {d.sandbox && <SandboxBadge />}
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
                <ActionForm action={decideDeposit} className="flex flex-wrap items-start gap-2 space-y-0">
                  <input type="hidden" name="depositId" value={d.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <button className={cn(adminButton, "bg-up/15 text-up")}>
                    Approve · credit {qty(d.amount.minus(d.fee))} {d.assetCode}
                  </button>
                </ActionForm>
                <ActionForm action={decideDeposit} className="flex flex-wrap items-start gap-2 space-y-0">
                  <input type="hidden" name="depositId" value={d.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <input
                    name="reason"
                    maxLength={500}
                    placeholder="Reason shown to the customer (optional)"
                    className={cn(adminInput, "flex-1")}
                  />
                  <button className={cn(adminButton, "bg-down/15 text-down")}>Reject</button>
                </ActionForm>
              </div>
            </section>
          );
        })}
      </div>
      <section className="glass rounded-2xl p-5">
        <h2 className="font-semibold">Recently decided</h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {recent.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <StatusBadge outcome={depositOutcome(d.status)} />
                <span className="tabular">
                  {qty(d.amount)} {d.assetCode}
                </span>
                {d.network && <span className="text-muted">{d.network}</span>}
                <span className="font-mono text-xs text-muted">{d.reference}</span>
                <Link href={`/admin/users/${d.user.id}`} className="text-muted hover:text-accent">
                  {d.user.email}
                </Link>
                {d.failureReason && <span className="w-full text-xs text-down">{d.failureReason}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
