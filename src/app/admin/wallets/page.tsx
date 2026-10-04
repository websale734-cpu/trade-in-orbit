import { requirePermission } from "@/server/admin/rbac";
import { depositWalletList, walletKey } from "@/server/wallets";
import { ActionForm } from "@/components/admin/action-form";
import { adminButton, adminInput } from "@/components/admin/styles";
import { cn } from "@/lib/utils";
import { updateDepositWallets } from "../actions";

export const metadata = { title: "Deposit wallets" };

/**
 * The platform wallet address customers deposit each coin to. USDT has one per
 * network. A coin without an address shows as "not available yet" on Deposit.
 */
export default async function AdminWallets() {
  await requirePermission("settings.manage");
  const coins = await depositWalletList();
  const missing = coins.flatMap((c) => c.networks.filter((n) => !n.address)).length;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Deposit wallets</h1>
      <p className="text-sm text-muted">
        Every customer depositing a coin is shown the address below, with a QR code. Double-check each address and
        network: coins sent to a wrong address can&apos;t be recovered. Leave a field empty to switch that coin (or
        network) off for deposits. Changes apply immediately and are recorded in the audit log.
        {missing > 0 && <strong className="text-warn"> {missing} address(es) not set yet.</strong>}
      </p>
      <section className="glass rounded-2xl p-5">
        <ActionForm action={updateDepositWallets}>
          <div className="divide-y divide-line">
            {coins.map((c) =>
              c.networks.map((n) => {
                const key = walletKey(c.code, n.id);
                return (
                  <div key={key} className="grid gap-2 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
                    <label htmlFor={key} className="text-sm">
                      <span className="font-semibold">{c.code}</span> <span className="text-muted">{c.name}</span>
                      <span className="block text-xs text-muted">Network: {n.label}</span>
                    </label>
                    <input
                      id={key}
                      name={key}
                      defaultValue={n.address ?? ""}
                      placeholder="Not set: deposits unavailable"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={200}
                      className={cn(adminInput, "w-full font-mono text-xs")}
                    />
                  </div>
                );
              }),
            )}
          </div>
          <button className={cn(adminButton, "bg-brand text-white")}>Save wallet addresses</button>
        </ActionForm>
      </section>
    </div>
  );
}
