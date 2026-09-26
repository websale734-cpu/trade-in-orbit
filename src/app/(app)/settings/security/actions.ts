"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { destroyCurrentSession, revokeAllSessions } from "@/server/auth/session";
import { logSecurityEvent } from "@/server/auth/security-log";
import { disableTotp, verifyAndConsumeTotp } from "@/server/auth/totp";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { formatRetry, rateLimit } from "@/server/rate-limit";
import { passwordChangedEmail, sendEmail } from "@/server/notify/email";
import { passwordPolicyError } from "@/lib/password-strength";
import type { FormState } from "@/components/ui/form";

export async function logoutOtherDevices(): Promise<void> {
  const session = await requireUser();
  const count = await revokeAllSessions(session.userId, session.id);
  await logSecurityEvent("LOGOUT_ALL", session.userId, { scope: "others", count });
  revalidatePath("/settings/security");
}

export async function logoutEverywhere(): Promise<void> {
  const session = await requireUser();
  await revokeAllSessions(session.userId);
  await logSecurityEvent("LOGOUT_ALL", session.userId, { scope: "all" });
  await destroyCurrentSession();
  redirect("/login");
}

export async function revokeSession(fd: FormData): Promise<void> {
  const session = await requireUser();
  const id = String(fd.get("sessionId") ?? "");
  // Scoped to the user's own sessions; an ID belonging to someone else matches nothing.
  const { count } = await db.session.updateMany({
    where: { id, userId: session.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count) await logSecurityEvent("SESSION_REVOKED", session.userId, { sessionId: id });
  revalidatePath("/settings/security");
}

export async function turnOffTwoFactor(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const { user } = await requireUser();
  if (!user.totpSecretEnc) return {};
  if (!(await verifyAndConsumeTotp(user.id, user.totpSecretEnc, String(fd.get("code") ?? ""))))
    return { error: "Incorrect code. 2FA is still on." };
  await disableTotp(user.id);
  await logSecurityEvent("TWO_FACTOR_DISABLED", user.id);
  revalidatePath("/settings/security");
  return { message: "Two-factor authentication is off." };
}

/**
 * Change password: requires the current password (and a 2FA code when 2FA is
 * on), then signs out every other device and sends a notice email.
 */
export async function changePassword(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const session = await requireUser();
  const { user } = session;
  const current = String(fd.get("currentPassword") ?? "");
  const next = String(fd.get("newPassword") ?? "");

  const rl = await rateLimit(`pwchange:${user.id}`, 5, 900);
  if (!rl.ok) return { error: `Too many attempts. Try again in ${formatRetry(rl.retryAfterSeconds)}.` };
  if (!(await verifyPassword(user.passwordHash, current))) return { fieldErrors: { currentPassword: "Incorrect password." } };
  if (user.totpSecretEnc && !(await verifyAndConsumeTotp(user.id, user.totpSecretEnc, String(fd.get("code") ?? ""))))
    return { fieldErrors: { code: "Incorrect 2FA code." } };
  const policy = passwordPolicyError(next, user.email);
  if (policy) return { fieldErrors: { newPassword: policy } };
  if (current === next) return { fieldErrors: { newPassword: "Choose a password you haven't just used." } };

  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  const count = await revokeAllSessions(user.id, session.id);
  await logSecurityEvent("PASSWORD_CHANGED", user.id, { otherSessionsRevoked: count });
  await sendEmail(passwordChangedEmail(user.email)).catch((err) => console.error("[password] notice failed:", err));
  revalidatePath("/settings/security");
  return { message: "Password changed. Other devices have been signed out." };
}

/** Back to the Security page after saving recovery codes. */
export async function finishSecuritySetup(): Promise<void> {
  redirect("/settings/security");
}
