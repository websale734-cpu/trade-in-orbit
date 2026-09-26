import { requirePermission } from "@/server/admin/rbac";
import { getSettings } from "@/server/settings";
import { ActionForm, adminButton } from "@/components/admin/action-form";
import { cn } from "@/lib/utils";
import { updateSettings } from "../actions";

export const metadata = { title: "Fees, limits & rewards" };

const SECTIONS = [
  {
    key: "fees",
    title: "Fees",
    help: "Basis points (100 = 1%). tradeBps: instant, maker, taker. depositBps per method. withdrawal: flat USD + bps per fiat method. network: crypto withdrawal fees per coin (charged in the coin).",
  },
  {
    key: "limits",
    title: "Limits by KYC level",
    help: 'Rolling 24-hour limits in USD value per KYC level ("0" = unverified, "1" = verified). minDeposit is per deposit.',
  },
  {
    key: "rewards",
    title: "Rewards",
    help: "stakingApyPct: variable annual rates per coin (shown with a risk notice, never as guaranteed). loyaltyTiers: 30-day volume thresholds and fee discounts. referral: bonuses and the qualifying first deposit.",
  },
] as const;

/**
 * Admin-editable settings as validated JSON. Every save is checked against a
 * strict schema (invalid input is rejected with the exact field) and audit-logged.
 */
export default async function AdminSettings() {
  await requirePermission("settings.manage");
  const settings = await getSettings();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Fees, limits &amp; rewards</h1>
      <p className="text-sm text-muted">
        Changes take effect within 15 seconds and are recorded in the audit log. The public fee table updates
        automatically.
      </p>
      {SECTIONS.map((s) => (
        <section key={s.key} className="glass rounded-2xl p-5">
          <ActionForm action={updateSettings}>
            <h2 className="font-semibold">{s.title}</h2>
            <p className="text-xs text-muted">{s.help}</p>
            <input type="hidden" name="key" value={s.key} />
            <textarea
              name="value"
              defaultValue={JSON.stringify(settings[s.key], null, 2)}
              rows={s.key === "limits" ? 10 : 18}
              spellCheck={false}
              aria-label={`${s.title} JSON`}
              className="w-full rounded-lg border border-line-strong bg-surface p-3 font-mono text-xs outline-none focus:border-accent"
            />
            <button className={cn(adminButton, "bg-brand text-white")}>Save {s.title.toLowerCase()}</button>
          </ActionForm>
        </section>
      ))}
    </div>
  );
}
