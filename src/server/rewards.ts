import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { hmac } from "./crypto";
import { Decimal, postEntry, systemLedgerAccount } from "./ledger";
import { notify } from "./notify/notifications";
import { getSettings } from "./settings";
import { getLivePrice } from "@/lib/market/price";
import { QUOTE_ASSET } from "@/config/funding";

/**
 * Referrals, affiliate stats and loyalty tiers.
 *
 * Referral bonuses are paid ONCE per referred customer, when their completed
 * deposits first reach the qualifying amount (settings.rewards.referral). The
 * payout is a REWARD journal entry from the REWARDS system account (the
 * marketing budget), so it's fully auditable. A unique constraint on the
 * referee makes a double payout impossible.
 */
const TX = { timeout: 20_000, maxWait: 10_000 } as const;
/** Cookie that carries a referral code from /r/CODE to sign-up (30 days). */
export const REFERRAL_COOKIE = "orb_ref";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } });
  if (user.referralCode) return user.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = [...randomBytes(8)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
    try {
      await db.user.update({ where: { id: userId }, data: { referralCode: code } });
      return code;
    } catch {
      /* collision: try another */
    }
  }
  throw new Error("Could not allocate a referral code");
}

export function isReferralCode(code: string): boolean {
  return /^[A-Z2-9]{8}$/.test(code);
}

/** Count a click on a referral link. The IP is stored only as a keyed hash. */
export async function recordReferralClick(code: string, ip: string | null) {
  await db.referralClick.create({ data: { code, ipHash: ip ? hmac("ref-click", ip) : null } });
}

/** Link a newly registered user to the referrer whose code they arrived with. */
export async function attachReferrer(newUserId: string, code: string | undefined) {
  if (!code || !isReferralCode(code)) return;
  const referrer = await db.user.findUnique({ where: { referralCode: code }, select: { id: true } });
  if (!referrer || referrer.id === newUserId) return;
  await db.user.update({ where: { id: newUserId }, data: { referredById: referrer.id } });
}

/** Pay both referral bonuses if this customer has just qualified. Safe to call repeatedly. */
export async function maybeAwardReferral(refereeId: string) {
  const referee = await db.user.findUnique({ where: { id: refereeId }, select: { referredById: true, name: true } });
  if (!referee?.referredById) return;
  if (await db.referralReward.findUnique({ where: { refereeId } })) return;

  const { referral } = (await getSettings()).rewards;
  const deposits = await db.deposit.findMany({ where: { userId: refereeId, status: "COMPLETED" } });
  let totalUsd = 0;
  for (const d of deposits) totalUsd += Number(d.amount) * Number(await getLivePrice(d.assetCode).catch(() => new Decimal(0)));
  if (totalUsd < referral.minDepositUsd) return;

  const referrerId = referee.referredById;
  const [refAcct, refereeAcct] = await Promise.all([
    db.account.findFirst({ where: { userId: referrerId, isDefault: true } }),
    db.account.findFirst({ where: { userId: refereeId, isDefault: true } }),
  ]);
  if (!refAcct || !refereeAcct) return;
  const a = new Decimal(referral.referrerBonusUsd);
  const b = new Decimal(referral.refereeBonusUsd);

  try {
    await db.$transaction(async (tx) => {
      const pool = await systemLedgerAccount(tx, "REWARDS", QUOTE_ASSET, true);
      const la1 = await tx.ledgerAccount.upsert({ where: { accountId_assetCode: { accountId: refAcct.id, assetCode: QUOTE_ASSET } }, update: {}, create: { accountId: refAcct.id, assetCode: QUOTE_ASSET } });
      const la2 = await tx.ledgerAccount.upsert({ where: { accountId_assetCode: { accountId: refereeAcct.id, assetCode: QUOTE_ASSET } }, update: {}, create: { accountId: refereeAcct.id, assetCode: QUOTE_ASSET } });
      const entry = await postEntry(tx, {
        type: "REWARD",
        description: "Referral bonus",
        userId: referrerId,
        idempotencyKey: `referral:${refereeId}`,
        metadata: { refereeId },
        postings: [
          { ledgerAccountId: pool.id, assetCode: QUOTE_ASSET, amount: a.plus(b).negated() },
          { ledgerAccountId: la1.id, assetCode: QUOTE_ASSET, amount: a },
          { ledgerAccountId: la2.id, assetCode: QUOTE_ASSET, amount: b },
        ],
      });
      await tx.referralReward.create({ data: { referrerId, refereeId, referrerAmount: a, refereeAmount: b, entryId: entry.id } });
    }, TX);
  } catch {
    return; // already paid (unique constraint / idempotency key) or a transient failure; retried on the next deposit
  }
  await Promise.all([
    notify(referrerId, { type: "ACCOUNT", title: "Referral bonus earned", body: `${a} ${QUOTE_ASSET} has been added to your account. Thanks for spreading the word!`, link: "/rewards" }),
    b.gt(0) && notify(refereeId, { type: "ACCOUNT", title: "Welcome bonus", body: `${b} ${QUOTE_ASSET} has been added to your account.`, link: "/rewards" }),
  ]).catch(() => {});
}

export async function affiliateStats(userId: string) {
  const code = await ensureReferralCode(userId);
  const [clicks, signups, rewards] = await Promise.all([
    db.referralClick.count({ where: { code } }),
    db.user.findMany({ where: { referredById: userId }, select: { id: true, name: true, createdAt: true, kycStatus: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.referralReward.findMany({ where: { referrerId: userId } }),
  ]);
  const paid = new Set(rewards.map((r) => r.refereeId));
  return {
    code,
    clicks,
    signups: signups.length,
    qualified: rewards.length,
    earningsUsd: rewards.reduce((s, r) => s + Number(r.referrerAmount), 0),
    referred: signups.map((s) => ({
      // First name + initial only: the referrer doesn't need the customer's full identity.
      name: `${s.name.split(/\s+/)[0]} ${s.name.split(/\s+/).slice(-1)[0]?.[0] ?? ""}.`,
      joinedAt: s.createdAt.toISOString(),
      verified: s.kycStatus === "APPROVED",
      rewarded: paid.has(s.id),
    })),
  };
}

// ---------------------------------------------------------------------------
// Loyalty tiers
// ---------------------------------------------------------------------------

/** Real (non-demo) filled trading volume in USD over the last 30 days. */
export async function tradingVolume30d(userId: string): Promise<number> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = await db.$queryRaw<{ v: number | null }[]>`
    SELECT sum(quantity * fill_price)::float AS v FROM orders
    WHERE user_id = ${userId} AND status = 'FILLED' AND demo = false AND filled_at >= ${since}`;
  return rows[0]?.v ?? 0;
}

export async function loyaltyStatus(userId: string) {
  const tiers = [...(await getSettings()).rewards.loyaltyTiers].sort((a, b) => a.minVolumeUsd - b.minVolumeUsd);
  const volume = await tradingVolume30d(userId);
  let index = 0;
  tiers.forEach((t, i) => {
    if (volume >= t.minVolumeUsd) index = i;
  });
  return { volume, tiers, current: tiers[index], next: tiers[index + 1] ?? null };
}

/** Trading-fee discount (0-100%) from the user's loyalty tier. */
export async function feeDiscountPct(userId: string): Promise<number> {
  return (await loyaltyStatus(userId)).current.feeDiscountPct;
}
