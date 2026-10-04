import type { Metadata } from "next";
import { Check, Clock, X } from "lucide-react";
import { PageIntro } from "@/components/accounts/page-parts";
import { KycGate, SandboxBadge } from "@/components/app/kyc-gate";
import { getDictionary } from "@/i18n/server";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { ensureDefaultAccount, listAccounts } from "@/server/ledger";
import { coinNetworks, WITHDRAWAL_ARRIVAL } from "@/config/funding";
import { getSettings } from "@/server/settings";
import { withdrawalOutcome } from "@/server/withdrawals";
import { supportedCoins } from "@/server/wallets";
import { StatusBadge } from "@/components/app/status-badge";
import { sandboxAdvanceWithdrawal, sandboxRejectWithdrawal } from "../sandbox-actions";
import { WithdrawForm, type WithdrawCoin } from "./withdraw-form";

export const metadata: Metadata = { title: "Withdraw" };

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
  const [accounts, withdrawals, settings, assets] = await Promise.all([
    listAccounts(user.id),
    db.withdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 15 }),
    getSettings(),
    supportedCoins(),
  ]);
  const devTools = process.env.NODE_ENV !== "production";
  const coins: WithdrawCoin[] = assets.map((a) => ({
    code: a.code,
    name: a.name,
    fee: settings.fees.network[a.code]?.fee ?? "0",
    networks: coinNetworks(a.code),
  }));

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <PageIntro {...intro}>
        <p className="text-sm text-muted">
          Every withdrawal is confirmed with{" "}
          {user.totpEnabledAt ? "an emailed code and your authenticator code" : "an emailed code"}.
        </p>
      </PageIntro>

      <WithdrawForm
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          balances: Object.fromEntries(a.ledgerAccounts.map((l) => [l.assetCode, l.balance.toString()])),
        }))}
        coins={coins}
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
              const dest = w.destination as { masked?: string; network?: string };
              const outcome = withdrawalOutcome(w.status);
              return (
                <li key={w.id} className="rounded-2xl border border-line p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StatusBadge outcome={outcome} />
                    <span className="tabular font-semibold">
                      {Number(w.amount).toLocaleString("en-US", { maximumFractionDigits: 8 })} {w.assetCode}
                    </span>
                    <span className="min-w-0 break-all text-muted">
                      to {dest.masked}
                      {dest.network ? ` (${dest.network})` : ""} · fee {Number(w.fee)} {w.assetCode}
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
                  {outcome === "PENDING" && (
                    <p className="mt-3 flex items-center gap-2 text-muted">
                      <Clock className="h-4 w-4 shrink-0" /> Awaiting approval. The amount has been deducted from your
                      balance.
                    </p>
                  )}
                  {outcome === "SUCCESS" && (
                    <p className="mt-3 flex items-center gap-2 text-up">
                      <Check className="h-4 w-4 shrink-0" /> Approved. Your withdrawal was successful.
                    </p>
                  )}
                  {outcome === "FAILED" && (
                    <p className="mt-3 flex items-center gap-2 text-down">
                      <X className="h-4 w-4 shrink-0" /> Rejected{w.rejectionReason ? `: ${w.rejectionReason}` : ""}.
                      The funds were returned to your balance.
                    </p>
                  )}
                  {w.txRef && <p className="mt-3 font-mono text-xs text-muted">Reference: {w.txRef}</p>}
                  {devTools && w.sandbox && outcome === "PENDING" && (
                    <div className="mt-3 flex gap-2 border-t border-line pt-3">
                      <form action={sandboxAdvanceWithdrawal}>
                        <input type="hidden" name="id" value={w.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-up/40 px-3 py-1 text-xs font-medium text-up hover:bg-up/10"
                        >
                          Simulate approval
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
