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

/**
 * The platform is crypto-only: there is no cash balance. Trades are priced and
 * settled in this coin (buy BTC with USDT, sell BTC for USDT).
 */
export const QUOTE_ASSET = "USDT";

/**
 * Networks a coin is deposited and withdrawn on. Most coins have one; USDT has
 * a separate wallet address per network. Admins set each address on the
 * Deposit wallets page.
 */
export type CoinNetwork = { id: string; label: string };
const MULTI_NETWORK: Record<string, CoinNetwork[]> = {
  USDT: [
    { id: "TRC20", label: "Tron (TRC20)" },
    { id: "ERC20", label: "Ethereum (ERC20)" },
  ],
};

export function coinNetworks(code: string): CoinNetwork[] {
  return MULTI_NETWORK[code] ?? [{ id: "MAIN", label: NETWORK_FEES[code]?.network ?? code }];
}

export const DEPOSIT_ARRIVAL = "Credited after an admin confirms the funds arrived";
export const WITHDRAWAL_ARRIVAL = "Usually within an hour of approval";

/** Rolling 24-hour limits by KYC level, in USD value. Level 0 (unverified) can't move money. */
export const KYC_LIMITS: Record<number, { depositDaily: number; withdrawDaily: number; minDeposit: number }> = {
  0: { depositDaily: 0, withdrawDaily: 0, minDeposit: 0 },
  1: { depositDaily: 50_000, withdrawDaily: 25_000, minDeposit: 10 },
};

/** Virtual balance (in QUOTE_ASSET) each user starts demo trading with. */
export const DEMO_STARTING_BALANCE = "10000";
