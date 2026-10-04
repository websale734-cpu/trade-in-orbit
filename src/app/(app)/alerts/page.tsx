import type { Metadata } from "next";
import { BellRing } from "lucide-react";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { MAX_ACTIVE_ALERTS } from "@/server/automation";
import { trackedCoins } from "@/config/coins";
import { cn, formatUsd } from "@/lib/utils";
import { cancelAlert } from "../automation-actions";
import { AlertForm } from "./alert-form";

export const metadata: Metadata = { title: "Price alerts" };

export default async function AlertsPage() {
  const { user } = await requireUser("/alerts");
  const [alerts, tradable] = await Promise.all([
    db.priceAlert.findMany({
      where: { userId: user.id, status: { not: "CANCELLED" } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 50,
    }),
    db.asset.findMany({ where: { enabled: true, tradingEnabled: true, type: "CRYPTO" }, select: { code: true } }),
  ]);
  const open = new Set(tradable.map((a) => a.code));
  const coins = trackedCoins.filter((c) => open.has(c.symbol)).map((c) => c.symbol);
  const active = alerts.filter((a) => a.status === "ACTIVE").length;

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Price alerts</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Get a notification when a coin crosses your price. Each alert fires once.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="glass min-w-0 rounded-[var(--radius-card)] p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold sm:text-lg">
            <BellRing className="h-4 w-4 text-accent" /> New alert
          </h2>
          {active >= MAX_ACTIVE_ALERTS ? (
            <p className="mt-3 text-sm text-muted">
              You have {MAX_ACTIVE_ALERTS} active alerts, the maximum. Cancel one to add another.
            </p>
          ) : (
            <AlertForm coins={coins} />
          )}
        </section>
        <section className="glass min-w-0 rounded-[var(--radius-card)] p-5 sm:p-6">
          <h2 className="text-base font-semibold sm:text-lg">
            Your alerts{" "}
            <span className="text-sm font-normal text-muted">
              ({active}/{MAX_ACTIVE_ALERTS} active)
            </span>
          </h2>
          {alerts.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No alerts yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm" data-testid="alert-list">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {a.assetCode} {a.direction === "ABOVE" ? "above" : "below"}{" "}
                      <span className="tabular">{formatUsd(Number(a.targetPrice))}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {a.status === "TRIGGERED" && a.triggeredAt ? (
                        <>
                          Triggered at {formatUsd(Number(a.triggeredPrice))} ·{" "}
                          <LocalTime date={a.triggeredAt.toISOString()} />
                        </>
                      ) : (
                        <>
                          Created <LocalTime date={a.createdAt.toISOString()} />
                          {a.notifyEmail && " · email on"}
                        </>
                      )}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      a.status === "ACTIVE" ? "bg-accent/15 text-accent" : "bg-surface-strong text-muted",
                    )}
                  >
                    {a.status === "ACTIVE" ? "Active" : "Triggered"}
                  </span>
                  {a.status === "ACTIVE" && (
                    <form action={cancelAlert}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className="text-sm font-medium text-muted hover:text-down">
                        Cancel
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-subtle">
            Prices are checked about once a minute, so fast moves may overshoot your target.
          </p>
        </section>
      </div>
    </div>
  );
}
