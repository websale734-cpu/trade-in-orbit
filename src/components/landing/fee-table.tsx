import { Reveal } from "@/components/ui/reveal";
import { defaultFeeSchedule, formatBps } from "@/config/fees";
import type { Dictionary } from "@/i18n/dictionaries/en";

/** Public fee schedule. Reads platform defaults until admin fee settings exist (Phase 5). */
export function FeeTable({ dict }: { dict: Dictionary }) {
  const t = dict.fees;
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
            {defaultFeeSchedule.map((line) => (
              <tr key={line.key} className="border-b border-line last:border-0">
                <td className="px-5 py-3.5 sm:px-6">{line.label}</td>
                <td className="tabular px-5 py-3.5 text-right font-semibold sm:px-6">
                  {line.bps !== null ? (
                    formatBps(line.bps)
                  ) : (
                    <span className="font-normal text-muted">{line.note}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-center text-xs text-muted">{t.note}</p>
    </Reveal>
  );
}
