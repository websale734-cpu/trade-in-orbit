"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { hmac, randomToken } from "@/server/crypto";
import { getRequestInfo } from "@/server/request-info";
import { formatRetry, limits, rateLimit } from "@/server/rate-limit";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, destroyCurrentSession, getSession, revokeAllSessions } from "@/server/auth/session";
import { checkCode, sendCode } from "@/server/auth/codes";
import { consumeRecoveryCode, verifyAndConsumeTotp } from "@/server/auth/totp";
import { logSecurityEvent } from "@/server/auth/security-log";
import { postAuthDestination } from "@/server/auth/dal";
import { passwordChangedEmail, sendEmail } from "@/server/notify/email";
import { passwordPolicyError } from "@/lib/password-strength";
import type { FormState } from "@/components/ui/form";

/** Version of the Terms the user accepted. Bump when the lawyer-reviewed text changes. */
const TERMS_VERSION = "draft-2026-09";
const MFA_COOKIE = "orb_mfa";
const MFA_TTL_MS = 5 * 60_000;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."))
  .pipe(z.string().max(254));

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

async function ipKey(): Promise<string> {
  return (await getRequestInfo()).ip ?? "unknown";
}

// ---------------------------------------------------------------------------
// Registration (step 1)
// ---------------------------------------------------------------------------

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(100, "Name is too long."),
  email: emailSchema,
  password: z.string(),
  terms: z.literal("on", { error: "You must accept the terms to continue." }),
});

export async function register(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const raw = Object.fromEntries(fd);
  const values = { name: String(raw.name ?? ""), email: String(raw.email ?? ""), terms: String(raw.terms ?? "") };
  const parsed = registerSchema.safeParse(raw);
  // Report every problem at once, including the password policy.
  const policy = passwordPolicyError(String(raw.password ?? ""), values.email);
  if (!parsed.success || policy) {
    const errors = parsed.success ? {} : fieldErrors(parsed.error);
    if (policy) errors.password = policy;
    return { fieldErrors: errors, values };
  }

  const { name, email, password } = parsed.data;

  const rl = await rateLimit(`register:${await ipKey()}`, limits.registerPerIp.limit, limits.registerPerIp.window);
  if (!rl.ok)
    return { error: `Too many sign-ups from this network. Try again in ${formatRetry(rl.retryAfterSeconds)}.`, values };

  if (await db.user.findUnique({ where: { email }, select: { id: true } }))
    return { fieldErrors: { email: "An account with this email already exists. Log in instead." }, values };

  const user = await db.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
    },
  });

  await logSecurityEvent("REGISTERED", user.id);
  await createSession(user.id);
  // A failed send isn't fatal: the verification page offers "Resend code".
  await sendCode(user.id, "EMAIL_VERIFY", email).catch((err) => console.error("[register] email code failed:", err));

  redirect("/onboarding/email");
}

// ---------------------------------------------------------------------------
// Login + second factor
// ---------------------------------------------------------------------------

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.").max(256) });

export async function login(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const raw = Object.fromEntries(fd);
  const values = { email: String(raw.email ?? "") };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const { email, password } = parsed.data;
  const next = typeof raw.next === "string" ? raw.next : null;

  const [ipLimit, emailLimit] = await Promise.all([
    rateLimit(`login:ip:${await ipKey()}`, limits.loginPerIp.limit, limits.loginPerIp.window),
    rateLimit(`login:email:${email}`, limits.loginPerEmail.limit, limits.loginPerEmail.window),
  ]);
  if (!ipLimit.ok || !emailLimit.ok) {
    const wait = Math.max(ipLimit.retryAfterSeconds, emailLimit.retryAfterSeconds);
    return { error: `Too many login attempts. Try again in ${formatRetry(wait)}.`, values };
  }

  const user = await db.user.findUnique({ where: { email } });
  let valid = false;
  if (user) valid = await verifyPassword(user.passwordHash, password);
  else await burnPasswordCheck(password); // equalise timing for unknown emails

  if (!user || !valid) {
    if (user) await logSecurityEvent("LOGIN_FAILED", user.id, { reason: "password" });
    return { error: "Incorrect email or password.", values };
  }
  if (user.status === "SUSPENDED") return { error: "This account is suspended. Please contact support.", values };

  if (user.totpSecretEnc) {
    // Password OK; hold a short-lived challenge until the 2FA code is entered.
    const token = randomToken();
    await db.authChallenge.create({
      data: { tokenHash: hmac("mfa", token), userId: user.id, expiresAt: new Date(Date.now() + MFA_TTL_MS) },
    });
    (await cookies()).set(MFA_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/login",
      maxAge: MFA_TTL_MS / 1000,
    });
    redirect(next ? `/login/verify?next=${encodeURIComponent(next)}` : "/login/verify");
  }

  await createSession(user.id);
  await logSecurityEvent("LOGIN_SUCCESS", user.id);
  redirect(postAuthDestination(user, next));
}

export async function verifyLoginTwoFactor(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const jar = await cookies();
  const token = jar.get(MFA_COOKIE)?.value;
  const expired: FormState = { error: "Your login attempt expired. Please log in again." };
  if (!token) return expired;

  const challenge = await db.authChallenge.findUnique({
    where: { tokenHash: hmac("mfa", token) },
    include: { user: true },
  });
  if (!challenge || challenge.usedAt || challenge.expiresAt.getTime() <= Date.now()) return expired;
  if (challenge.attempts >= limits.twoFactorPerChallenge.limit)
    return { error: "Too many incorrect codes. Please log in again." };

  await db.authChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });

  const { user } = challenge;
  const mode = fd.get("mode") === "recovery" ? "recovery" : "totp";
  const input = String(fd.get(mode === "recovery" ? "recovery" : "code") ?? "");
  const ok =
    mode === "recovery"
      ? await consumeRecoveryCode(user.id, input)
      : !!user.totpSecretEnc && (await verifyAndConsumeTotp(user.id, user.totpSecretEnc, input));

  if (!ok) {
    await logSecurityEvent("LOGIN_2FA_FAILED", user.id, { mode });
    return {
      error: mode === "recovery" ? "That recovery code isn't valid or was already used." : "Incorrect code. Try again.",
    };
  }

  await db.authChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date() } });
  jar.delete({ name: MFA_COOKIE, path: "/login" });
  await createSession(user.id);
  await logSecurityEvent("LOGIN_SUCCESS", user.id, { secondFactor: mode });
  if (mode === "recovery") await logSecurityEvent("RECOVERY_CODE_USED", user.id);

  const next = fd.get("next");
  redirect(postAuthDestination(user, typeof next === "string" ? next : null));
}

export async function logout(): Promise<void> {
  const session = await getSession();
  await destroyCurrentSession();
  if (session) await logSecurityEvent("LOGOUT", session.userId);
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Password reset by email code
// ---------------------------------------------------------------------------

export async function requestPasswordReset(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(fd.get("email"));
  const values = { email: String(fd.get("email") ?? "") };
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0].message }, values };
  const email = parsed.data;

  const rl = await rateLimit(`reset:${await ipKey()}`, limits.resetPerIp.limit, limits.resetPerIp.window);
  if (!rl.ok) return { error: `Too many requests. Try again in ${formatRetry(rl.retryAfterSeconds)}.`, values };

  // Same response whether or not the account exists, so this can't be used to discover emails.
  const user = await db.user.findUnique({ where: { email } });
  if (user && user.status === "ACTIVE") {
    const sent = await sendCode(user.id, "PASSWORD_RESET", email).catch((err) => {
      console.error("[reset] email failed:", err);
      return null;
    });
    if (sent?.ok) await logSecurityEvent("PASSWORD_RESET_REQUESTED", user.id);
  }
  redirect(`/reset-password?email=${encodeURIComponent(email)}`);
}

const resetSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
  password: z.string(),
});

export async function resetPassword(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { email, code, password } = parsed.data;

  const policy = passwordPolicyError(password, email);
  if (policy) return { fieldErrors: { password: policy } };

  const user = await db.user.findUnique({ where: { email } });
  if (!user) return { error: "That code isn't valid. Request a new one." };

  const result = await checkCode(user.id, "PASSWORD_RESET", code);
  if (!result.ok) return { error: result.error };

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  await revokeAllSessions(user.id);
  await logSecurityEvent("PASSWORD_RESET", user.id);
  await sendEmail(passwordChangedEmail(user.email)).catch((err) => console.error("[reset] notice failed:", err));

  redirect("/login?reset=1");
}
