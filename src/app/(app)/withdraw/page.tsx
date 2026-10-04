import type { Metadata } from "next";
import { Check, X } from "lucide-react";
import { PageIntro } from "@/components/accounts/page-parts";
import { KycGate, SandboxBadge } from "@/components/app/kyc-gate";
import { getDictionary } from "@/i18n/server";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { ensureDefaultAccount, listAccounts } from "@/server/ledger";
import { limitsFor } from "@/server/funding";
import { WITHDRAWAL_ARRIVAL } from "@/config/funding";
import { getSettings } from "@/server/settings";
import { cn } from "@/lib/utils";
import { sandboxAdvanceWithdrawal, sandboxRejectWithdrawal } from "../sandbox-actions";
import { WithdrawForm } from "./withdraw-form";

export const metadata: Metadata = { title: "Withdraw" };

const STEPS = ["REQUESTED", "UNDER_REVIEW", "APPROVED", "SENT", "COMPLETED"] as const;
const STEP_LABEL: Record<string, string> = {
  REQUESTED: "Requested",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  SENT: "Sent",
  COMPLETED: "Completed",
};

export default async function WithdrawPage() {
  const { user } = await requireUser("/withdraw");
  const t = (await getDictionary()).app.accounts;
  const intro = {
    title: t.actions.withdraw,
    intro: t.withdrawIntro,
    back: { href: "/accounts", label: t.allAccounts },
  };
  if (user.kycStatus !== "APPROVED")
    return (
      <div className="min-w-0 space-y-6 sm:space-y-8">
        <PageIntro {...intro} />
        <KycGate action="withdraw" status={user.kycStatus} />
      </div>
    );

  await ensureDefaultAccount(user.id);
  const [accounts, limits, withdrawals, addresses, settings] = await Promise.all([
    listAccounts(user.id),
    limitsFor(user),
    db.withdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    db.withdrawalAddress.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    getSettings(),
  ]);
  const devTools = process.env.NODE_ENV !== "production";

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <PageIntro {...intro}>
        <p className="text-sm text-muted">
          24-hour limit remaining:{" "}
          <strong className="text-fg">
            ${limits.withdrawRemaining.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </strong>{" "}
          of ${limits.withdrawDaily.toLocaleString("en-US")}. Every withdrawal needs{" "}
          {user.totpEnabledAt ? "an authenticator code" : "an emailed code"}.
        </p>
      </PageIntro>

      <WithdrawForm
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          balances: Object.fromEntries(a.ledgerAccounts.map((l) => [l.assetCode, l.balance.toString()])),
        }))}
        addresses={addresses.map((a) => ({
          id: a.id,
          assetCode: a.assetCode,
          label: a.label,
          address: a.address,
          confirmed: !!a.confirmedAt,
        }))}
        fees={{ fiat: settings.fees.withdrawal, network: settings.fees.network }}
        arrival={WITHDRAWAL_ARRIVAL}
        usesTotp={!!user.totpEnabledAt}
      />

      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
        <h2 className="text-base font-semibold sm:text-lg">Withdrawal status</h2>
        {withdrawals.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No withdrawals yet.</p>
        ) : (
          <ul className="mt-3 space-y-4">
            {withdrawals.map((w) => {
              const dest = w.destination as { masked?: string };
              const idx = STEPS.indexOf(w.status as (typeof STEPS)[number]);
              const rejected = w.status === "REJECTED";
              return (
                <li key={w.id} className="rounded-2xl border border-line p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="tabular font-semibold">
                      {Number(w.amount).toLocaleString("en-US", { maximumFractionDigits: 8 })} {w.assetCode}
                    </span>
                    <span className="text-muted">
                      to {dest.masked} · fee {Number(w.fee)} {w.assetCode}
                    </span>
                    {w.sandbox && <SandboxBadge />}
                    <span className="ml-auto text-xs text-muted">
                      <LocalTime date={w.createdAt.toISOString()} />
                    </span>
                  </div>
                  {w.scheduledFor && w.status === "REQUESTED" && (
                    <p className="mt-1 text-xs text-accent">
                      Scheduled for <LocalTime date={w.scheduledFor.toISOString()} />
                    </p>
                  )}
                  {/* Status tracker */}
                  {rejected ? (
                    <p className="mt-3 flex items-center gap-2 text-down">
                      <X className="h-4 w-4" /> Rejected: {w.rejectionReason}. The funds were returned to your account.
                    </p>
                  ) : (
                    <ol className="mt-4 grid grid-cols-5 gap-1" aria-label="Withdrawal progress">
                      {STEPS.map((s, i) => (
                        <li
                          key={s}
                          className="flex flex-col items-center gap-1.5 text-center"
                          aria-current={i === idx ? "step" : undefined}
                        >
                          <span
                            className={cn(
                              "grid h-6 w-6 place-items-center rounded-full text-xs font-bold",
                              i < idx || w.status === "COMPLETED"
                                ? "bg-brand text-white"
                                : i === idx
                                  ? "border-2 border-accent text-accent"
                                  : "border border-line-strong text-subtle",
                            )}
                          >
                            {i < idx || w.status === "COMPLETED" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                          </span>
                          <span
                            className={cn(
                              "hidden text-xs leading-tight sm:block",
                              i <= idx ? "text-fg" : "text-subtle",
                            )}
                          >
                            {STEP_LABEL[s]}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {!rejected && idx >= 0 && (
                    <p className="mt-2 text-xs text-muted sm:hidden">
                      Step {idx + 1} of {STEPS.length}: <span className="text-fg">{STEP_LABEL[w.status]}</span>
                    </p>
                  )}
                  {w.txRef && <p className="mt-3 font-mono text-xs text-muted">Reference: {w.txRef}</p>}
                  {devTools && w.sandbox && !["COMPLETED", "REJECTED"].includes(w.status) && (
                    <div className="mt-3 flex gap-2 border-t border-line pt-3">
                      <form action={sandboxAdvanceWithdrawal}>
                        <input type="hidden" name="id" value={w.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-up/40 px-3 py-1 text-xs font-medium text-up hover:bg-up/10"
                        >
                          Simulate next step
                        </button>
                      </form>
                      {w.status !== "SENT" && (
                        <form action={sandboxRejectWithdrawal}>
                          <input type="hidden" name="id" value={w.id} />
                          <button
                            type="submit"
                            className="rounded-full border border-down/40 px-3 py-1 text-xs font-medium text-down hover:bg-down/10"
                          >
                            Simulate rejection
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
