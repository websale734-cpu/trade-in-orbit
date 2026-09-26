/**
 * Funding, trading and withdrawal parameters: fees, limits, arrival times.
 *
 * These are platform defaults; the admin panel (Phase 5) will manage them. All
 * USD. REVIEW BEFORE LAUNCH: they're placeholders, not a pricing decision.
 */
import type { PaymentMethod } from "@/generated/prisma/enums";

/** Fee rates in basis points (1 bp = 0.01%). */
export const TRADE_FEES_BPS = { instant: 50, maker: 10, taker: 20 } as const;

/** Max price move between the quote the user saw and execution. */
export const MAX_SLIPPAGE_BPS = 100;

/** Which assets each method moves. Fiat rails move USD; crypto moves coins. */
export const FIAT_METHODS: PaymentMethod[] = ["BANK", "CARD", "MOBILE_MONEY"];

export const DEPOSIT_FEES_BPS: Record<PaymentMethod, number> = { BANK: 0, CARD: 290, MOBILE_MONEY: 150, CRYPTO: 0 };

export const WITHDRAWAL_FEES: Record<Exclude<PaymentMethod, "CRYPTO">, { flat: number; bps: number }> = {
  BANK: { flat: 5, bps: 0 },
  CARD: { flat: 0, bps: 150 },
  MOBILE_MONEY: { flat: 0, bps: 100 },
};

/** Crypto withdrawal network fees, charged in the asset being withdrawn (passed through at cost). */
export const NETWORK_FEES: Record<string, { fee: string; network: string }> = {
  BTC: { fee: "0.0002", network: "Bitcoin" },
  ETH: { fee: "0.002", network: "Ethereum (ERC-20)" },
  SOL: { fee: "0.01", network: "Solana" },
  USDT: { fee: "1", network: "Ethereum (ERC-20)" },
  BNB: { fee: "0.001", network: "BNB Smart Chain (BEP-20)" },
  XRP: { fee: "0.25", network: "XRP Ledger" },
  ADA: { fee: "1", network: "Cardano" },
  DOGE: { fee: "5", network: "Dogecoin" },
  AVAX: { fee: "0.01", network: "Avalanche C-Chain" },
  TRX: { fee: "1", network: "TRON (TRC-20)" },
  LINK: { fee: "0.3", network: "Ethereum (ERC-20)" },
  DOT: { fee: "0.1", network: "Polkadot" },
};

export const ARRIVAL: Record<PaymentMethod, string> = {
  BANK: "1–3 business days",
  CARD: "Instant to 30 minutes",
  MOBILE_MONEY: "Within minutes",
  CRYPTO: "About 30 minutes after network confirmations",
};

export const WITHDRAWAL_ARRIVAL: Record<PaymentMethod, string> = {
  BANK: "1–3 business days after approval",
  CARD: "2–5 business days after approval",
  MOBILE_MONEY: "Within an hour of approval",
  CRYPTO: "Usually within an hour of approval",
};

/** Rolling 24-hour limits by KYC level, in USD value. Level 0 (unverified) can't move money. */
export const KYC_LIMITS: Record<number, { depositDaily: number; withdrawDaily: number; minDeposit: number }> = {
  0: { depositDaily: 0, withdrawDaily: 0, minDeposit: 0 },
  1: { depositDaily: 50_000, withdrawDaily: 25_000, minDeposit: 10 },
};

/** Virtual balance each user starts demo trading with. */
export const DEMO_STARTING_USD = "10000";
