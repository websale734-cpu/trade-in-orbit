import "server-only";
import { z } from "zod";
import { db } from "./db";
import { DEPOSIT_FEES_BPS, KYC_LIMITS, NETWORK_FEES, TRADE_FEES_BPS, WITHDRAWAL_FEES } from "@/config/funding";

/**
 * Admin-editable platform settings.
 *
 * Each section is validated with Zod on write AND on read (a malformed row
 * falls back to the defaults rather than breaking checkout). The defaults
 * live in src/config/funding.ts and seed a fresh install. Reads are cached for
 * 15 seconds per server instance, so an admin change takes effect within that time.
 */
const bps = z.number().int().min(0).max(5_000);
const money = z.number().min(0).max(1_000_000_000);

export const settingsSchemas = {
  fees: z.object({
    tradeBps: z.object({ instant: bps, maker: bps, taker: bps }),
    depositBps: z.object({ BANK: bps, CARD: bps, MOBILE_MONEY: bps, CRYPTO: bps }),
    withdrawal: z.object({
      BANK: z.object({ flat: money, bps }),
      CARD: z.object({ flat: money, bps }),
      MOBILE_MONEY: z.object({ flat: money, bps }),
    }),
    network: z.record(z.string(), z.object({ fee: z.string().regex(/^\d+(\.\d+)?$/), network: z.string().min(1) })),
  }),
  limits: z.record(
    z.string().regex(/^\d$/),
    z.object({ depositDaily: money, withdrawDaily: money, minDeposit: money }),
  ),
  rewards: z.object({
    /** Variable, admin-set annual rates. Never guaranteed. */
    stakingApyPct: z.record(z.string(), z.number().min(0).max(100)),
    loyaltyTiers: z
      .array(z.object({ name: z.string().min(1), minVolumeUsd: money, feeDiscountPct: z.number().min(0).max(100) }))
      .min(1),
    referral: z.object({ referrerBonusUsd: money, refereeBonusUsd: money, minDepositUsd: money }),
  }),
};

export type Settings = { [K in keyof typeof settingsSchemas]: z.infer<(typeof settingsSchemas)[K]> };
export type SettingsKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  fees: { tradeBps: TRADE_FEES_BPS, depositBps: DEPOSIT_FEES_BPS, withdrawal: WITHDRAWAL_FEES, network: NETWORK_FEES },
  limits: Object.fromEntries(Object.entries(KYC_LIMITS).map(([k, v]) => [String(k), v])),
  rewards: {
    stakingApyPct: { USDT: 4, ETH: 2.5, SOL: 5, ADA: 2, DOT: 7 },
    loyaltyTiers: [
      { name: "Bronze", minVolumeUsd: 0, feeDiscountPct: 0 },
      { name: "Silver", minVolumeUsd: 10_000, feeDiscountPct: 10 },
      { name: "Gold", minVolumeUsd: 100_000, feeDiscountPct: 20 },
      { name: "Platinum", minVolumeUsd: 1_000_000, feeDiscountPct: 35 },
    ],
    referral: { referrerBonusUsd: 20, refereeBonusUsd: 10, minDepositUsd: 100 },
  },
};

const TTL_MS = 15_000;
let cache: { value: Settings; expires: number } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache && cache.expires > Date.now()) return cache.value;
  const rows = await db.platformSetting.findMany();
  const value = { ...DEFAULT_SETTINGS } as Settings;
  for (const row of rows) {
    const key = row.key as SettingsKey;
    const schema = settingsSchemas[key];
    if (!schema) continue;
    const parsed = schema.safeParse(row.value);
    if (parsed.success) (value as Record<string, unknown>)[key] = parsed.data;
    else console.error(`[settings] invalid stored value for ${key}; using defaults`);
  }
  cache = { value, expires: Date.now() + TTL_MS };
  return value;
}

/** Validate and save one section. Returns an error message or null. */
export async function saveSetting<K extends SettingsKey>(
  key: K,
  value: unknown,
  actorId: string,
): Promise<string | null> {
  const parsed = settingsSchemas[key].safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return `${issue.path.join(".") || key}: ${issue.message}`;
  }
  await db.platformSetting.upsert({
    where: { key },
    update: { value: parsed.data as object, updatedById: actorId },
    create: { key, value: parsed.data as object, updatedById: actorId },
  });
  cache = null;
  return null;
}
