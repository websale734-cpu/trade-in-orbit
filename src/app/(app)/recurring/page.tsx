import type { Metadata } from "next";
import { Repeat } from "lucide-react";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { ensureDefaultAccount } from "@/server/ledger";
import { MAX_ACTIVE_RECURRING, MIN_RECURRING_USD } from "@/server/automation";
import { trackedCoins } from "@/config/coins";
import { cn, formatMoney } from "@/lib/utils";
import { updateRecurring } from "../automation-actions";
import { RecurringForm } from "./recurring-form";

export const metadata: Metadata = { title: "Recurring buys" };

const FREQ = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly" } as const;

export default async function RecurringPage() {
  const { user } = await requireUser("/recurring");
  await ensureDefaultAccount(user.id);
  const [plans, accounts, tradable] = await Promise.all([
    db.recurringBuy.findMany({ where: { userId: user.id, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" } }),
    db.account.findMany({
      where: { userId: user.id, archivedAt: null, type: { not: "DEMO" } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    db.asset.findMany({ where: { enabled: true, tradingEnabled: true, NOT: { code: "USD" } }, select: { code: true } }),
  ]);
  const open = new Set(tradable.map((a) => a.code));
  const coins = trackedCoins.filter((c) => open.has(c.symbol)).map((c) => c.symbol);
  const names = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Recurring buys</h1>
        <p className="mt-1 text-sm text-muted">
          Buy a fixed dollar amount on a schedule (dollar-cost averaging). Crypto prices can fall as well as rise; buying
          regularly doesn&apos;t guarantee a profit.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Repeat className="h-4 w-4 text-accent" /> New schedule
          </h2>
          {plans.length >= MAX_ACTIVE_RECURRING ? (
            <p className="mt-3 text-sm text-muted">You have the maximum of {MAX_ACTIVE_RECURRING} schedules.</p>
          ) : (
            <RecurringForm coins={coins} accounts={accounts} min={MIN_RECURRING_USD} />
          )}
        </section>
        <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
          <h2 className="font-semibold">Your schedules</h2>
          {plans.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No recurring buys yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm" data-testid="recurring-list">
              {plans.map((p) => (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="flex-1 font-medium">
                      {formatMoney(Number(p.amountUsd))} of {p.assetCode} · {FREQ[p.frequency]}
                    </p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        p.status === "ACTIVE" ? "bg-up/15 text-up" : "bg-warn/15 text-warn",
                      )}
                    >
                      {p.status === "ACTIVE" ? "Active" : "Paused"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    From {names.get(p.accountId) ?? "account"} ·{" "}
                    {p.status === "ACTIVE" ? (
                      <>
                        next <LocalTime date={p.nextRunAt.toISOString()} />
                      </>
                    ) : (
                      "paused"
                    )}
                    {p.lastResult && <> · last: {p.lastResult}</>}
                  </p>
                  <div className="mt-2 flex gap-4">
                    {(p.status === "ACTIVE" ? ["pause", "cancel"] : ["resume", "cancel"]).map((op) => (
                      <form key={op} action={updateRecurring}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="op" value={op} />
                        <button
                          type="submit"
                          className={cn("text-sm font-medium capitalize text-muted", op === "cancel" ? "hover:text-down" : "hover:text-fg")}
                        >
                          {op}
                        </button>
                      </form>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-subtle">
            Each purchase is an instant buy at the live price, with your usual fee. If your USD balance is too low the
            purchase is skipped and you&apos;re notified; three misses in a row pause the schedule.
          </p>
        </section>
      </div>
    </div>
  );
}
