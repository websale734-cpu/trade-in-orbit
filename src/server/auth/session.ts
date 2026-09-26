import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "../db";
import { env } from "../env";
import { hmac, randomToken } from "../crypto";
import { getRequestInfo } from "../request-info";

/**
 * Database-backed sessions.
 *
 * The browser holds a random 256-bit token in an httpOnly cookie; the database
 * stores only its HMAC. That makes "log out all devices" and per-session
 * revocation immediate, unlike a stateless JWT.
 *
 * Timeouts:
 *   - idle:     SESSION_IDLE_MINUTES since last activity (default 30)
 *   - absolute: SESSION_MAX_HOURS since sign-in (default 12)
 */
export const SESSION_COOKIE = "orb_session";
const TOUCH_INTERVAL_MS = 60_000;

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function createSession(userId: string): Promise<void> {
  const token = randomToken();
  const info = await getRequestInfo();
  const expiresAt = new Date(Date.now() + env().SESSION_MAX_HOURS * 3_600_000);

  await db.session.create({
    data: {
      tokenHash: hmac("session", token),
      userId,
      ip: info.ip,
      userAgent: info.userAgent?.slice(0, 512),
      device: info.device,
      location: info.location,
      expiresAt,
    },
  });

  (await cookies()).set(SESSION_COOKIE, token, { ...cookieBase, expires: expiresAt });
}

/**
 * The current session and its user, or null. Memoised per request, so layouts,
 * pages and actions can all call it without extra queries.
 */
export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hmac("session", token) },
    include: { user: true },
  });
  if (!session || session.revokedAt) return null;

  const now = Date.now();
  const idleLimit = env().SESSION_IDLE_MINUTES * 60_000;
  if (session.expiresAt.getTime() <= now || now - session.lastSeenAt.getTime() > idleLimit) {
    await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } }).catch(() => {});
    return null;
  }
  if (session.user.status === "SUSPENDED") return null;

  // Sliding idle window. Throttled so page loads don't write on every request.
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return session;
});

/** A user's sessions that are still live (not revoked, expired or idle), most recent first. */
export function listActiveSessions(userId: string) {
  const idleCutoff = new Date(Date.now() - env().SESSION_IDLE_MINUTES * 60_000);
  return db.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() }, lastSeenAt: { gt: idleCutoff } },
    orderBy: { lastSeenAt: "desc" },
  });
}

/** Revoke the current session and clear its cookie. */
export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({
      where: { tokenHash: hmac("session", token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(SESSION_COOKIE);
}

/** Revoke every session for a user, optionally keeping one (the current device). */
export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const { count } = await db.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return count;
}
