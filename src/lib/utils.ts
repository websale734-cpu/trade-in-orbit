/** Join class names, skipping falsy values. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Format a USD price with precision that suits its magnitude
 * (e.g. $64,213.50, $1.0003, $0.08412).
 */
export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 5 : 8;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: abs >= 1000 ? 2 : Math.min(2, digits),
    maximumFractionDigits: digits,
  }).format(value);
}

/** Format a USD amount of money (not a price) with exactly 2 decimals, e.g. $1,250.00. */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

/** Format a percentage change with an explicit sign, e.g. +2.41% / -0.87%. */
export function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}
