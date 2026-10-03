import type { Metadata } from "next";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { ensureDefaultAccount } from "@/server/ledger";
import { ensureDemoAccount, matchOpenOrders, userTradeFees } from "@/server/trading";
import { trackedCoins } from "@/config/coins";
import { cn } from "@/lib/utils";
import { cancelLimitOrder } from "./actions";
import { TradePanel } from "./trade-panel";
import { OrderBook } from "./order-book";
import { Converter } from "./converter";

export const metadata: Metadata = { title: "Trade" };

export default async function TradePage({ searchParams }: PageProps<"/trade">) {
  const { user } = await requireUser("/trade");
  const sp = await searchParams;
  const demo = sp.mode === "demo";
  const side = typeof sp.side === "string" && ["buy", "sell", "swap", "limit"].includes(sp.side) ? sp.side : "buy";

  // Settle any of this user's limit orders whose price has been reached.
  await matchOpenOrders({ userId: user.id }).catch(() => 0);

  const accounts = demo
    ? [await ensureDemoAccount(user.id)]
    : (await ensureDefaultAccount(user.id),
      await db.account.findMany({
        where: { userId: user.id, archivedAt: null, type: { not: "DEMO" } },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      }));

  const [balances, openOrders, fills, fees, tradable] = await Promise.all([
    db.ledgerAccount.findMany({ where: { accountId: { in: accounts.map((a) => a.id) } }, include: { asset: true } }),
    db.order.findMany({ where: { userId: user.id, demo, status: "OPEN" }, orderBy: { createdAt: "desc" } }),
    db.order.findMany({ where: { userId: user.id, demo, status: "FILLED" }, orderBy: { filledAt: "desc" }, take: 10 }),
    userTradeFees(user.id, demo),
    db.asset.findMany({ where: { enabled: true, tradingEnabled: true }, select: { code: true } }),
  ]);

  const accountData = accounts.map((a) => ({
    id: a.id,
    name: demo ? "Demo (virtual funds)" : a.name,
    balances: Object.fromEntries(
      balances.filter((b) => b.accountId === a.id).map((b) => [b.assetCode, b.balance.toString()]),
    ),
  }));
  // Only coins whose trading pair is open (admins can close pairs).
  const open = new Set(tradable.map((a) => a.code));
  const coins = trackedCoins
    .filter((c) => open.has(c.symbol))
    .map((c) => ({ code: c.symbol, name: c.name, chartable: !!c.binanceSymbol }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Trade
          {demo && (
            <span className="rounded-md bg-warn px-2 py-0.5 text-sm font-bold tracking-widest text-black">DEMO</span>
          )}
        </h1>
        <div
          className="flex rounded-full border border-line bg-surface p-1 text-sm font-semibold"
          role="tablist"
          aria-label="Trading mode"
        >
          <Link
            href={`/trade?side=${side}`}
            role="tab"
            aria-selected={!demo}
            className={cn("rounded-full px-4 py-1.5", !demo ? "bg-brand text-white" : "text-muted")}
          >
            Real
          </Link>
          <Link
            href={`/trade?mode=demo&side=${side}`}
            role="tab"
            aria-selected={demo}
            className={cn("rounded-full px-4 py-1.5", demo ? "bg-warn text-black" : "text-muted")}
          >
            Demo
          </Link>
        </div>
      </div>

      {demo && (
        <div className="flex items-center gap-3 rounded-2xl border-2 border-warn bg-warn/10 p-4 text-sm" role="note">
          <FlaskConical className="h-5 w-5 shrink-0 text-warn" />
          <p>
            <strong>DEMO MODE:</strong> you&apos;re trading with virtual funds at live prices. Nothing here is real
            money, and demo balances can&apos;t be withdrawn or moved to your real accounts.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <TradePanel
          key={demo ? "demo" : "real"}
          demo={demo}
          initialTab={side as "buy" | "sell" | "swap" | "limit"}
          accounts={accountData}
          coins={coins}
          fees={fees}
        />
        <OrderBook coins={coins.filter((c) => c.chartable).map((c) => c.code)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
          <h2 className="font-semibold">
            Open limit orders {demo && <span className="text-xs font-bold text-warn">DEMO</span>}
          </h2>
          {openOrders.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No open orders.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {openOrders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-3">
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-xs font-bold",
                      o.side === "BUY" ? "bg-up/15 text-up" : "bg-down/15 text-down",
                    )}
                  >
                    {o.side}
                  </span>
                  <span className="tabular flex-1">
                    {Number(o.quantity)} {o.baseAsset} @ ${Number(o.limitPrice).toLocaleString("en-US")}
                  </span>
                  <form action={cancelLimitOrder}>
                    <input type="hidden" name="orderId" value={o.id} />
                    <button type="submit" className="text-sm font-medium text-muted hover:text-down">
                      Cancel
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-subtle">
            Limit orders fill at your price against Trade In Orbit&apos;s liquidity once the market reaches it. Funds stay
            reserved until then.
          </p>
        </section>

        <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
          <h2 className="font-semibold">
            Recent trades {demo && <span className="text-xs font-bold text-warn">DEMO</span>}
          </h2>
          {fills.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No trades yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {fills.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-3">
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-xs font-bold",
                      o.side === "BUY" ? "bg-up/15 text-up" : "bg-down/15 text-down",
                    )}
                  >
                    {o.side}
                  </span>
                  <span className="tabular flex-1">
                    {Number(o.quantity)} {o.baseAsset} @ $
                    {Number(o.fillPrice).toLocaleString("en-US", { maximumFractionDigits: 4 })}
                    <span className="ml-2 text-xs text-muted">{o.type === "LIMIT" ? "limit" : "market"}</span>
                  </span>
                  <span className="text-xs text-muted">
                    <LocalTime date={(o.filledAt ?? o.createdAt).toISOString()} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Converter coins={coins.map((c) => c.code)} fees={fees} />
    </div>
  );
}
