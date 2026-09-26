import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { hmac, randomToken, safeEqual } from "./crypto";
import { rateLimit } from "./rate-limit";
import { nextOnboardingStep } from "./auth/dal";
import type { ApiPermission, User } from "@/generated/prisma/client";

/**
 * API keys for the public REST API (/api/v1).
 *
 * Format: orb_<prefix>_<secret>. The prefix (public, unique) finds the key;
 * only an HMAC of the secret is stored, so a database leak doesn't expose
 * working keys. The full key is shown to the user exactly once.
 *
 * READ keys can view balances, prices and orders. TRADE keys can also place
 * and cancel orders. No key can ever withdraw or move funds off-platform.
 */
export const MAX_KEYS = 5;
export const API_RATE = { limit: 120, window: 60 };

export async function createApiKey(userId: string, name: string, permission: ApiPermission) {
  const prefix = randomBytes(6).toString("hex");
  const secret = randomToken(32);
  const key = await db.apiKey.create({
    data: { userId, name, permission, prefix, secretHash: hmac("api-key", secret) },
  });
  return { id: key.id, token: `orb_${prefix}_${secret}` };
}

export class ApiAuthError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

/** Authenticate a request's `Authorization: Bearer orb_...` header. */
export async function authenticateApiKey(request: Request, need: ApiPermission = "READ"): Promise<User> {
  const header = request.headers.get("authorization") ?? "";
  const m = /^Bearer orb_([0-9a-f]{12})_([A-Za-z0-9_-]{20,100})$/.exec(header.trim());
  if (!m) throw new ApiAuthError("Missing or malformed API key.", 401);
  const [, prefix, secret] = m;

  const key = await db.apiKey.findUnique({ where: { prefix }, include: { user: true } });
  // Compare in constant time even when the prefix is unknown.
  const expected = key?.secretHash ?? hmac("api-key", "invalid");
  const valid = safeEqual(expected, hmac("api-key", secret)) && !!key && !key.revokedAt;
  if (!valid || !key) throw new ApiAuthError("Invalid API key.", 401);
  if (key.user.status !== "ACTIVE" || nextOnboardingStep(key.user)) throw new ApiAuthError("Account unavailable.", 403);
  if (need === "TRADE" && key.permission !== "TRADE") throw new ApiAuthError("This key is read-only.", 403);

  const rl = await rateLimit(`api:${key.id}`, API_RATE.limit, API_RATE.window);
  if (!rl.ok) throw new ApiAuthError("Rate limit exceeded.", 429, rl.retryAfterSeconds);

  // Record usage at most once a minute.
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000)
    await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return key.user;
}

/** Run an API handler with uniform auth and error responses. */
export async function withApiKey(request: Request, need: ApiPermission, fn: (user: User) => Promise<Response>) {
  try {
    const user = await authenticateApiKey(request, need);
    return await fn(user);
  } catch (err) {
    if (err instanceof ApiAuthError)
      return Response.json(
        { error: err.message },
        { status: err.status, headers: err.retryAfter ? { "Retry-After": String(err.retryAfter) } : undefined },
      );
    throw err;
  }
}
