/**
 * Currencies a user can choose for showing balances in local currency.
 * Codes are lower-case ISO 4217 and must exist in CoinGecko's exchange-rate feed.
 */
export const DISPLAY_CURRENCIES = [
  "usd",
  "eur",
  "gbp",
  "ngn",
  "kes",
  "zar",
  "inr",
  "cad",
  "aud",
  "jpy",
  "brl",
  "aed",
  "chf",
  "sgd",
  "hkd",
  "mxn",
  "try",
  "pln",
  "sek",
  "php",
] as const;

export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export function isDisplayCurrency(value: string): value is DisplayCurrency {
  return (DISPLAY_CURRENCIES as readonly string[]).includes(value);
}

/** "£1,234.56" style formatting for any display currency. */
export function formatMoney(value: number, currency: string, opts: { compact?: boolean } = {}): string {
  const code = currency.toUpperCase();
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : code === "JPY" ? 0 : 2,
  }).format(value);
}
