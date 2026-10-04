import "server-only";
import { z } from "zod";
import { db } from "./db";
import { coinNetworks, type CoinNetwork } from "@/config/funding";

/**
 * Platform deposit wallets: one address per coin, and one per network for
 * coins on several networks (USDT on TRC20 and ERC20). Admins set them on the
 * Deposit wallets page; every customer depositing that coin on that network
 * is shown the same address. Stored in platform_settings.
 */
const KEY = "depositWallets";
const schema = z.record(z.string().regex(/^[A-Z0-9]{2,10}:[A-Z0-9]{2,10}$/), z.string().trim().max(200));

export const walletKey = (assetCode: string, networkId: string) => `${assetCode}:${networkId}`;

export async function getDepositWallets(): Promise<Record<string, string>> {
  const row = await db.platformSetting.findUnique({ where: { key: KEY } });
  const parsed = schema.safeParse(row?.value ?? {});
  if (!parsed.success) console.error("[wallets] invalid stored value; showing no addresses");
  return parsed.success ? Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v)) : {};
}

export async function saveDepositWallets(wallets: Record<string, string>, actorId: string) {
  const value = schema.parse(Object.fromEntries(Object.entries(wallets).filter(([, v]) => v.trim())));
  await db.platformSetting.upsert({
    where: { key: KEY },
    update: { value, updatedById: actorId },
    create: { key: KEY, value, updatedById: actorId },
  });
  return value;
}

/** Coins customers can deposit and withdraw: every enabled crypto asset (there is no cash). */
export function supportedCoins() {
  return db.asset.findMany({ where: { enabled: true, type: "CRYPTO" }, orderBy: { sortOrder: "asc" } });
}

export type CoinWallets = {
  code: string;
  name: string;
  decimals: number;
  networks: (CoinNetwork & { address: string | null })[];
};

/** Every supported coin with its networks and the address set for each (null = not set yet). */
export async function depositWalletList(): Promise<CoinWallets[]> {
  const [coins, wallets] = await Promise.all([supportedCoins(), getDepositWallets()]);
  return coins.map((c) => ({
    code: c.code,
    name: c.name,
    decimals: c.decimals,
    networks: coinNetworks(c.code).map((n) => ({ ...n, address: wallets[walletKey(c.code, n.id)] ?? null })),
  }));
}
