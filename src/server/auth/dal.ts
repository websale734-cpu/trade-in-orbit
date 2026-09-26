import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "./session";
import type { User } from "@/generated/prisma/client";

/**
 * Data Access Layer for authentication. Every protected page, layout and
 * Server Action calls one of these. The proxy only does an optimistic cookie
 * check, so these are the real authorization boundary.
 */

export type OnboardingStep = "email" | "phone" | "two-factor";

/** Steps are ordered; the first unmet one is where the user must go next. */
export const ONBOARDING_PATHS: Record<OnboardingStep, string> = {
  email: "/onboarding/email",
  phone: "/onboarding/phone",
  "two-factor": "/onboarding/two-factor",
};

/**
 * The next required onboarding step, or null when the user can use the app.
 * Email and phone verification are mandatory; the 2FA screen is shown once
 * (the user may skip it). KYC is optional to browse, and required to move money
 * (enforced by the funding flows in Phase 4).
 */
export function nextOnboardingStep(
  user: Pick<User, "emailVerifiedAt" | "phoneVerifiedAt" | "twoFactorPromptedAt">,
): OnboardingStep | null {
  if (!user.emailVerifiedAt) return "email";
  if (!user.phoneVerifiedAt) return "phone";
  if (!user.twoFactorPromptedAt) return "two-factor";
  return null;
}

/** Signed-in session or redirect to login. */
export async function requireSession(next?: string) {
  const session = await getSession();
  if (!session) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return session;
}

/** Signed-in and fully onboarded, otherwise redirected to login or the pending step. */
export async function requireUser(next?: string) {
  const session = await requireSession(next);
  const step = nextOnboardingStep(session.user);
  if (step) redirect(ONBOARDING_PATHS[step]);
  return session;
}

/** Where to send a user right after sign-in or registration. */
export function postAuthDestination(
  user: Pick<User, "emailVerifiedAt" | "phoneVerifiedAt" | "twoFactorPromptedAt">,
  next?: string | null,
) {
  const step = nextOnboardingStep(user);
  if (step) return ONBOARDING_PATHS[step];
  return safeNext(next) ?? "/dashboard";
}

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

/** Mask an email for display: jo***@example.com */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

/** Mask a phone number for display: +44 ••• ••• 0123 */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)} ••• ••• ${phone.slice(-4)}`;
}
