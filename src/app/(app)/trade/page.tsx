import type { Metadata } from "next";
import Link from "next/link";
import { Activity, FlaskConical, ListOrdered } from "lucide-react";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { ensureDefaultAccount } from "@/server/ledger";
import { ensureDemoAccount, matchOpenOrders, userTradeFees } from "@/server/trading";
import { trackedCoins } from "@/config/coins";
import { QUOTE_ASSET } from "@/config/funding";
import { EmptyState, PageHeader, PageStack, Panel, segmentedItem, segmentedWrap } from "@/components/app/ui";
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
    db.asset.findMany({ where: { enabled: true, tradingEnabled: true, type: "CRYPTO" }, select: { code: true } }),
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
  // Coin pages link here with ?asset=BTC to preselect that coin.
  const asset = typeof sp.asset === "string" ? sp.asset.toUpperCase() : undefined;
  const initialAsset = coins.some((c) => c.code === asset) ? asset : undefined;

  const demoTag = demo && <span className="text-xs font-bold tracking-wider text-warn">DEMO</span>;
  const sideBadge = (s: string) => (
    <span
      className={cn(
        "grid h-10 w-14 shrink-0 place-items-center rounded-xl text-xs font-bold tracking-wide",
        s === "BUY" ? "bg-up/15 text-up" : "bg-down/15 text-down",
      )}
    >
      {s}
    </span>
  );

  return (
    <PageStack>
      <PageHeader
        title="Trade"
        subtitle="Buy, sell, swap or place a limit order at live prices. The full fee is shown before you confirm."
        badge={
          demo && (
            <span className="rounded-md bg-warn px-2 py-0.5 text-sm font-bold tracking-widest text-black">DEMO</span>
          )
        }
        actions={
          <div className={segmentedWrap} role="tablist" aria-label="Trading mode">
            <Link
              href={`/trade?side=${side}`}
              role="tab"
              aria-selected={!demo}
              className={cn(segmentedItem, !demo ? "bg-brand text-white" : "text-muted hover:text-fg")}
            >
              Real
            </Link>
            <Link
              href={`/trade?mode=demo&side=${side}`}
              role="tab"
              aria-selected={demo}
              className={cn(segmentedItem, demo ? "bg-warn text-black" : "text-muted hover:text-fg")}
            >
              Demo
            </Link>
          </div>
        }
      />

      {demo && (
        <div
          className="flex items-start gap-3 rounded-[var(--radius-card)] border-2 border-warn bg-warn/10 p-5 text-sm leading-relaxed"
          role="note"
        >
          <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
          <p>
            <strong>DEMO MODE:</strong> you&apos;re trading with virtual funds at live prices. Nothing here is real
            money, and demo balances can&apos;t be withdrawn or moved to your real accounts.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0">
          <TradePanel
            key={demo ? "demo" : "real"}
            demo={demo}
            initialTab={side as "buy" | "sell" | "swap" | "limit"}
            initialAsset={initialAsset}
            accounts={accountData}
            coins={coins}
            fees={fees}
            quote={QUOTE_ASSET}
          />
        </div>
        <div className="min-w-0">
          <OrderBook coins={coins.filter((c) => c.chartable).map((c) => c.code)} />
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Panel
          title={<span className="flex items-center gap-2">Open limit orders {demoTag}</span>}
          description="Limit orders fill at your price against Trade In Orbit's liquidity once the market reaches it. Funds stay reserved until then."
        >
          {openOrders.length === 0 ? (
            <EmptyState icon={<ListOrdered className="h-5 w-5" />} title="No open orders." />
          ) : (
            <ul className="divide-y divide-line text-sm">
              {openOrders.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-3.5 sm:gap-4">
                  {sideBadge(o.side)}
                  <span className="min-w-0 flex-1">
                    <span className="tabular block font-semibold">
                      {Number(o.quantity)} {o.baseAsset}
                    </span>
                    <span className="tabular block text-xs text-muted sm:text-sm">
                      at {Number(o.limitPrice).toLocaleString("en-US")} {QUOTE_ASSET}
                    </span>
                  </span>
                  <form action={cancelLimitOrder}>
                    <input type="hidden" name="orderId" value={o.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-muted transition-colors hover:border-down/40 hover:text-down"
                    >
                      Cancel
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={<span className="flex items-center gap-2">Recent trades {demoTag}</span>}>
          {fills.length === 0 ? (
            <EmptyState icon={<Activity className="h-5 w-5" />} title="No trades yet." />
          ) : (
            <ul className="divide-y divide-line text-sm">
              {fills.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-3.5 sm:gap-4">
                  {sideBadge(o.side)}
                  <span className="min-w-0 flex-1">
                    <span className="tabular block font-semibold">
                      {Number(o.quantity)} {o.baseAsset}
                    </span>
                    <span className="tabular block text-xs text-muted sm:text-sm">
                      at {Number(o.fillPrice).toLocaleString("en-US", { maximumFractionDigits: 4 })} {QUOTE_ASSET} ·{" "}
                      {o.type === "LIMIT" ? "limit" : "market"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted">
                    <LocalTime date={(o.filledAt ?? o.createdAt).toISOString()} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Converter coins={coins.map((c) => c.code)} fees={fees} />
    </PageStack>
  );
}
