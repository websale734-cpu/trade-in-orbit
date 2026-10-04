import { requirePermission } from "@/server/admin/rbac";
import { db } from "@/server/db";
import { cn } from "@/lib/utils";
import { toggleAsset } from "../actions";

export const metadata = { title: "Coins & pairs" };

/** Enable/disable coins (deposits, withdrawals, visibility) and their X/USDT trading pairs. */
export default async function AdminCoins() {
  await requirePermission("settings.manage");
  // Crypto only: there is no cash balance (the legacy USD asset stays in the database for old history).
  const assets = await db.asset.findMany({ where: { type: "CRYPTO" }, orderBy: { sortOrder: "asc" } });
  const Toggle = ({
    code,
    field,
    on,
    locked,
  }: {
    code: string;
    field: "enabled" | "tradingEnabled";
    on: boolean;
    locked?: boolean;
  }) => (
    <form action={toggleAsset}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="field" value={field} />
      <button
        disabled={locked}
        aria-pressed={on}
        aria-label={`${field === "enabled" ? "Coin" : "Trading pair"} ${code}: ${on ? "on" : "off"}`}
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors disabled:opacity-40",
          on ? "bg-up" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
            on ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </form>
  );
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Coins &amp; trading pairs</h1>
      <p className="text-sm text-muted">
        Turning a coin off hides it from deposits and withdrawals. Turning its pair off stops new buy/sell/swap/limit
        orders (open orders still settle or can be cancelled).
      </p>
      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-subtle uppercase">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium">Asset</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Coin enabled</th>
              <th className="px-4 py-3 font-medium">Trading pair (/USDT)</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.code} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <span className="font-semibold">{a.code}</span> <span className="text-muted">{a.name}</span>
                </td>
                <td className="px-4 py-3 text-xs">{a.type}</td>
                <td className="px-4 py-3">
                  <Toggle code={a.code} field="enabled" on={a.enabled} />
                </td>
                <td className="px-4 py-3">
                  <Toggle code={a.code} field="tradingEnabled" on={a.tradingEnabled} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
