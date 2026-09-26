/** Format basis points as a percentage string, e.g. 50 -> "0.50%", 0 -> "Free". */
export function formatBps(bps: number): string {
  return bps === 0 ? "Free" : `${(bps / 100).toFixed(2)}%`;
}
