"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { destroyCurrentSession, revokeAllSessions } from "@/server/auth/session";
import { logSecurityEvent } from "@/server/auth/security-log";
import { disableTotp, verifyAndConsumeTotp } from "@/server/auth/totp";
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

/** Back to the Security page after saving recovery codes. */
export async function finishSecuritySetup(): Promise<void> {
  redirect("/settings/security");
}
