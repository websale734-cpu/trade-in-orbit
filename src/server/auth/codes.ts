import "server-only";
import { db } from "../db";
import { hmac, randomCode, safeEqual } from "../crypto";
import { formatRetry, limits, rateLimit } from "../rate-limit";
import { passwordResetEmail, sendEmail, verificationCodeEmail } from "../notify/email";
import { checkSmsVerification, startSmsVerification } from "../notify/sms";
import type { CodePurpose, VerificationCode } from "@/generated/prisma/client";

/**
 * One-time 6-digit codes for email verification, phone verification and
 * password reset.
 *
 * Rules (spec §2):
 *   - codes expire after 10 minutes
 *   - 60-second cooldown between sends
 *   - 5 wrong attempts invalidate the code (the user must request a new one)
 *   - at most 5 sends per hour per user and purpose
 */
export const CODE_TTL_MINUTES = 10;
export const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

export type SendResult = { ok: true } | { ok: false; error: string; retryAfterSeconds?: number };
export type CheckResult =
  | { ok: true }
  | { ok: false; error: string; reason: "invalid" | "expired" | "locked" | "missing"; attemptsLeft?: number };

/** The latest unconsumed code for this user and purpose. */
export function activeCode(userId: string, purpose: CodePurpose): Promise<VerificationCode | null> {
  return db.verificationCode.findFirst({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

/** The active code only if it can still be used (not expired, attempts left). */
export async function usableCode(userId: string, purpose: CodePurpose): Promise<VerificationCode | null> {
  const code = await activeCode(userId, purpose);
  return code && code.expiresAt.getTime() > Date.now() && code.attempts < code.maxAttempts ? code : null;
}

/** Seconds until another code can be sent (0 when allowed now). */
export function cooldownRemaining(code: Pick<VerificationCode, "lastSentAt"> | null): number {
  if (!code) return 0;
  const elapsed = (Date.now() - code.lastSentAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed));
}

/**
 * Issue (or re-issue) a code and deliver it. Re-issuing replaces the previous
 * code, so only the newest one works.
 */
export async function sendCode(userId: string, purpose: CodePurpose, target: string): Promise<SendResult> {
  const existing = await activeCode(userId, purpose);
  const wait = existing?.target === target ? cooldownRemaining(existing) : 0;
  if (wait > 0)
    return { ok: false, error: `Please wait ${wait}s before requesting a new code.`, retryAfterSeconds: wait };

  const rl = await rateLimit(`code:${purpose}:${userId}`, limits.codeSendPerUser.limit, limits.codeSendPerUser.window);
  if (!rl.ok)
    return {
      ok: false,
      error: `Too many codes requested. Try again in ${formatRetry(rl.retryAfterSeconds)}.`,
      retryAfterSeconds: rl.retryAfterSeconds,
    };

  // Deliver first, then persist, so a failed send doesn't burn the cooldown.
  let codeHash: string | null;
  if (purpose === "PHONE_VERIFY") {
    const started = await startSmsVerification(target);
    codeHash = started.mode === "local" ? hmac(`code:${purpose}`, started.code) : null;
  } else {
    const code = randomCode();
    const message =
      purpose === "PASSWORD_RESET"
        ? passwordResetEmail(target, code, CODE_TTL_MINUTES)
        : verificationCodeEmail(target, code, CODE_TTL_MINUTES);
    await sendEmail(message);
    codeHash = hmac(`code:${purpose}`, code);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60_000);
  await db.$transaction([
    // Invalidate any older code for this purpose.
    db.verificationCode.updateMany({ where: { userId, purpose, consumedAt: null }, data: { consumedAt: now } }),
    db.verificationCode.create({
      data: {
        userId,
        purpose,
        target,
        codeHash,
        maxAttempts: MAX_ATTEMPTS,
        sendCount: (existing?.target === target ? existing.sendCount : 0) + 1,
        lastSentAt: now,
        expiresAt,
      },
    }),
  ]);
  return { ok: true };
}

/** Check a submitted code. On success the code is consumed. */
export async function checkCode(userId: string, purpose: CodePurpose, submitted: string): Promise<CheckResult> {
  const code = await activeCode(userId, purpose);
  if (!code) return { ok: false, reason: "missing", error: "No active code. Request a new one." };
  if (code.expiresAt.getTime() <= Date.now())
    return { ok: false, reason: "expired", error: "This code has expired. Request a new one." };
  if (code.attempts >= code.maxAttempts)
    return { ok: false, reason: "locked", error: "Too many incorrect attempts. Request a new code." };

  // Count the attempt before checking, atomically, so parallel guesses can't exceed the limit.
  const counted = await db.verificationCode.updateMany({
    where: { id: code.id, attempts: { lt: code.maxAttempts }, consumedAt: null },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0)
    return { ok: false, reason: "locked", error: "Too many incorrect attempts. Request a new code." };

  const clean = submitted.replace(/\D/g, "");
  const valid =
    clean.length === 6 &&
    (code.codeHash === null
      ? await checkSmsVerification(code.target, clean)
      : safeEqual(code.codeHash, hmac(`code:${purpose}`, clean)));

  if (!valid) {
    const attemptsLeft = code.maxAttempts - (code.attempts + 1);
    return attemptsLeft > 0
      ? {
          ok: false,
          reason: "invalid",
          attemptsLeft,
          error: `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left.`,
        }
      : { ok: false, reason: "locked", error: "Too many incorrect attempts. Request a new code." };
  }

  await db.verificationCode.update({ where: { id: code.id }, data: { consumedAt: new Date() } });
  return { ok: true };
}
