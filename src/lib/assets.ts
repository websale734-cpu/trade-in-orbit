/** "Bitcoin (BTC)". Assets whose name is their ticker (BNB, XRP) show once. */
export function assetLabel(code: string, name: string): string {
  return name && name !== code ? `${name} (${code})` : code;
}

/** Quantity with thousands separators, up to the asset's decimal places. */
export function formatQty(amount: string | number, decimals = 8): string {
  return Number(amount).toLocaleString("en-US", { maximumFractionDigits: decimals });
}
