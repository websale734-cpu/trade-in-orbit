import { Reveal } from "@/components/ui/reveal";
import { formatBps } from "@/config/fees";
import { getSettings } from "@/server/settings";
import type { Dictionary } from "@/i18n/dictionaries/en";

/** Public fee schedule, read from the live admin-managed settings. */
export async function FeeTable({ dict }: { dict: Dictionary }) {
  const t = dict.fees;
  const { fees } = await getSettings();
  const fiatW = (m: "BANK" | "CARD" | "MOBILE_MONEY") => {
    const w = fees.withdrawal[m];
    return [w.flat ? `$${w.flat}` : null, w.bps ? formatBps(w.bps) : null].filter(Boolean).join(" + ") || "Free";
  };
  const lines: [string, string][] = [
    ["Instant buy / sell / swap", formatBps(fees.tradeBps.instant)],
    ["Limit order (maker)", formatBps(fees.tradeBps.maker)],
    ["Market order (taker)", formatBps(fees.tradeBps.taker)],
    ["Bank transfer deposit", formatBps(fees.depositBps.BANK)],
    ["Card deposit", formatBps(fees.depositBps.CARD)],
    ["Mobile money deposit", formatBps(fees.depositBps.MOBILE_MONEY)],
    ["Crypto deposit", formatBps(fees.depositBps.CRYPTO)],
    ["Bank withdrawal", fiatW("BANK")],
    ["Mobile money withdrawal", fiatW("MOBILE_MONEY")],
    ["Crypto withdrawal", "Network fee at cost"],
  ];

  return (
    <Reveal className="mx-auto max-w-3xl">
      <div className="glass overflow-hidden rounded-[var(--radius-card)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs tracking-wide text-subtle uppercase">
              <th className="px-5 py-3 font-medium sm:px-6">{t.type}</th>
              <th className="px-5 py-3 text-right font-medium sm:px-6">{t.fee}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(([label, value]) => (
              <tr key={label} className="border-b border-line last:border-0">
                <td className="px-5 py-3.5 sm:px-6">{label}</td>
                <td className="tabular px-5 py-3.5 text-right font-semibold sm:px-6">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-center text-xs text-muted">{t.note}</p>
    </Reveal>
  );
}
