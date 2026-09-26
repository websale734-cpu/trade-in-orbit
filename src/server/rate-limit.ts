import "server-only";
import { db } from "./db";

/**
 * Fixed-window rate limiter backed by Postgres, so limits hold across every
 * server instance (in-memory counters don't work on serverless hosts).
 *
 * One atomic upsert per check: the counter resets once its window has expired.
 */
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const rows = await db.$queryRaw<{ count: number; expires_at: Date }[]>`
    INSERT INTO rate_limits (key, count, expires_at)
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT (key) DO UPDATE SET
      count      = CASE WHEN rate_limits.expires_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
      expires_at = CASE WHEN rate_limits.expires_at <= now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END
    RETURNING count, expires_at`;

  const { count, expires_at } = rows[0];
  const retryAfterSeconds = Math.max(0, Math.ceil((expires_at.getTime() - Date.now()) / 1000));
  return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfterSeconds };
}

/** Preset limits used across the auth flows. */
export const limits = {
  registerPerIp: { limit: 10, window: 3600 },
  loginPerIp: { limit: 30, window: 900 },
  loginPerEmail: { limit: 8, window: 900 },
  twoFactorPerChallenge: { limit: 5, window: 600 },
  codeSendPerUser: { limit: 5, window: 3600 },
  resetPerIp: { limit: 10, window: 3600 },
  kycPerUser: { limit: 5, window: 86400 },
} as const;

export function formatRetry(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
