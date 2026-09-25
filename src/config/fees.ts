/**
 * Default fee schedule.
 *
 * These are the platform defaults used until an admin saves fee settings
 * (admin panel, Phase 5). After that, the database values take precedence and
 * this file only seeds a fresh install. REVIEW THESE BEFORE LAUNCH.
 *
 * Rates are expressed in basis points (1 bp = 0.01%) to avoid floating-point
 * surprises when fees are applied to money.
 */
export type FeeLine = {
  key: string;
  label: string;
  /** Percentage fee in basis points, or null when the fee is a flat/network amount. */
  bps: number | null;
  /** Human description for non-percentage fees. */
  note?: string;
};

export const defaultFeeSchedule: FeeLine[] = [
  { key: "instant_trade", label: "Instant buy / sell / swap", bps: 50 },
  { key: "maker", label: "Order book: maker", bps: 10 },
  { key: "taker", label: "Order book: taker", bps: 20 },
  { key: "deposit_bank", label: "Bank transfer deposit", bps: 0 },
  { key: "deposit_card", label: "Card deposit", bps: 290 },
  { key: "deposit_mobile", label: "Mobile money deposit", bps: 150 },
  { key: "deposit_crypto", label: "Crypto deposit", bps: 0 },
  { key: "withdraw_bank", label: "Bank withdrawal", bps: null, note: "Flat fee, shown at confirmation" },
  { key: "withdraw_crypto", label: "Crypto withdrawal", bps: null, note: "Network fee at cost" },
];

/** Format basis points as a percentage string, e.g. 50 -> "0.50%". */
export function formatBps(bps: number): string {
  return bps === 0 ? "Free" : `${(bps / 100).toFixed(2)}%`;
}
