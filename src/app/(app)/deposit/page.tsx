import type { Metadata } from "next";
import { KycGate, SandboxBadge } from "@/components/app/kyc-gate";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { ensureDefaultAccount, listAccounts } from "@/server/ledger";
import { limitsFor, methodMode } from "@/server/funding";
import { ARRIVAL, DEPOSIT_FEES_BPS } from "@/config/funding";
import { trackedCoins } from "@/config/coins";
import { cn } from "@/lib/utils";
import { sandboxConfirmDeposit, sandboxFailDeposit } from "../sandbox-actions";
import { DepositForm } from "./deposit-form";

export const metadata: Metadata = { title: "Deposit" };

const STATUS_STYLE = {
  PENDING: "bg-warn/15 text-warn",
  COMPLETED: "bg-up/15 text-up",
  FAILED: "bg-down/15 text-down",
  CANCELLED: "bg-surface-strong text-muted",
} as const;

export default async function DepositPage({ searchParams }: PageProps<"/deposit">) {
  const { user } = await requireUser("/deposit");
  const sp = await searchParams;
  if (user.kycStatus !== "APPROVED")
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Deposit</h1>
        <KycGate action="deposit" status={user.kycStatus} />
      </div>
    );

  await ensureDefaultAccount(user.id);
  const [accounts, limits, deposits] = await Promise.all([
    listAccounts(user.id),
    limitsFor(user),
    db.deposit.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const devTools = process.env.NODE_ENV !== "production";

  const bank = {
    accountName: process.env.BANK_ACCOUNT_NAME || "Orbtrade Client Money (SANDBOX)",
    bankName: process.env.BANK_NAME || "Sandbox Bank",
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || "00000000",
    routing: process.env.BANK_ROUTING || "00-00-00",
    configured: !!process.env.BANK_ACCOUNT_NUMBER,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Deposit</h1>
        <p className="mt-1 text-sm text-muted">
          Deposits are credited once the payment is confirmed. 24-hour limit remaining:{" "}
          <strong className="text-fg">
            ${limits.depositRemaining.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </strong>{" "}
          of ${limits.depositDaily.toLocaleString("en-US")}.
        </p>
      </div>
      {sp.status === "processing" && (
        <p className="rounded-xl border border-up/30 bg-up/10 p-3 text-sm" role="status">
          Payment received by our card processor. Your deposit will be credited as soon as it&apos;s confirmed.
        </p>
      )}
      {sp.status === "cancelled" && (
        <p className="rounded-xl border border-line bg-surface p-3 text-sm" role="status">
          Card payment cancelled. You haven&apos;t been charged.
        </p>
      )}

      <DepositForm
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        methods={(["BANK", "CARD", "MOBILE_MONEY", "CRYPTO"] as const).map((m) => ({
          id: m,
          mode: methodMode(m),
          feeBps: DEPOSIT_FEES_BPS[m],
          arrival: ARRIVAL[m],
        }))}
        minDeposit={limits.minDeposit}
        coins={trackedCoins.map((c) => c.symbol)}
        bank={bank}
        devTools={devTools}
      />

      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
        <h2 className="font-semibold">Deposit history</h2>
        {deposits.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No deposits yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {deposits.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                <span className={cn("rounded px-2 py-0.5 text-xs font-bold", STATUS_STYLE[d.status])}>{d.status}</span>
                <span className="tabular font-medium">
                  {Number(d.amount).toLocaleString("en-US", { maximumFractionDigits: 8 })} {d.assetCode}
                </span>
                <span className="text-muted">{d.method.replace("_", " ").toLowerCase()}</span>
                <span className="font-mono text-xs text-muted">{d.reference}</span>
                {d.sandbox && <SandboxBadge />}
                <span className="ml-auto text-xs text-muted">
                  <LocalTime date={d.createdAt.toISOString()} />
                </span>
                {devTools && d.sandbox && d.status === "PENDING" && (
                  <span className="flex w-full gap-2 sm:w-auto">
                    <form action={sandboxConfirmDeposit}>
                      <input type="hidden" name="id" value={d.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-up/40 px-3 py-1 text-xs font-medium text-up hover:bg-up/10"
                      >
                        Simulate confirmation
                      </button>
                    </form>
                    <form action={sandboxFailDeposit}>
                      <input type="hidden" name="id" value={d.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-down/40 px-3 py-1 text-xs font-medium text-down hover:bg-down/10"
                      >
                        Simulate failure
                      </button>
                    </form>
                  </span>
                )}
                {d.failureReason && <span className="w-full text-xs text-down">{d.failureReason}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
