"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { smsEnabled } from "@/server/env";
import { activeCode, checkCode, cooldownRemaining, RESEND_COOLDOWN_SECONDS, sendCode } from "@/server/auth/codes";
import { ONBOARDING_PATHS, nextOnboardingStep, requireSession } from "@/server/auth/dal";
import { logSecurityEvent } from "@/server/auth/security-log";
import { confirmTotpSetup } from "@/server/auth/totp";
import { createKycSubmission, validateKycFile, type ValidFile } from "@/server/kyc";
import { formatRetry, limits, rateLimit } from "@/server/rate-limit";
import { COUNTRY_CODES } from "@/config/countries";
import type { FormState } from "@/components/ui/form";

type ResendState = FormState & { cooldown?: number };

/** Continue to whatever step is next (or the KYC step once required steps are done). */
async function continueOnboarding(userId: string): Promise<never> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const step = nextOnboardingStep(user);
  redirect(step ? ONBOARDING_PATHS[step] : "/onboarding/kyc");
}

// ---------------------------------------------------------------------------
// Email (step 2)
// ---------------------------------------------------------------------------

export async function verifyEmail(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const { user } = await requireSession();
  if (user.emailVerifiedAt) return continueOnboarding(user.id);

  const result = await checkCode(user.id, "EMAIL_VERIFY", String(fd.get("code") ?? ""));
  if (!result.ok) return { error: result.error };

  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  await logSecurityEvent("EMAIL_VERIFIED", user.id);
  return continueOnboarding(user.id);
}

export async function resendEmailCode(): Promise<ResendState> {
  const { user } = await requireSession();
  if (user.emailVerifiedAt) return {};
  const res = await sendCode(user.id, "EMAIL_VERIFY", user.email).catch((err) => {
    console.error("[onboarding] email resend failed:", err);
    return { ok: false as const, error: "We couldn't send the email. Please try again shortly." };
  });
  return res.ok
    ? { message: "A new code is on its way.", cooldown: RESEND_COOLDOWN_SECONDS }
    : { error: res.error, cooldown: "retryAfterSeconds" in res ? res.retryAfterSeconds : undefined };
}

// ---------------------------------------------------------------------------
// Phone (step 3)
// ---------------------------------------------------------------------------

/** Accepts "+44 7700 900-123" style input and returns E.164, or null. */
function normalisePhone(input: string): string | null {
  const compact = input.replace(/[\s().-]/g, "");
  const withPlus = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  return /^\+[1-9]\d{7,14}$/.test(withPlus) ? withPlus : null;
}

export type PhoneState = FormState & { sentTo?: string; cooldown?: number };

export async function sendPhoneCode(_prev: PhoneState | undefined, fd: FormData): Promise<PhoneState> {
  const { user } = await requireSession();
  if (!user.emailVerifiedAt) redirect(ONBOARDING_PATHS.email);
  if (user.phoneVerifiedAt || !smsEnabled()) return continueOnboarding(user.id);

  const raw = String(fd.get("phone") ?? "");
  const phone = normalisePhone(raw);
  if (!phone)
    return {
      fieldErrors: { phone: "Enter a valid mobile number with country code, e.g. +44 7700 900123." },
      values: { phone: raw },
    };

  const taken = await db.user.findFirst({ where: { phone, NOT: { id: user.id } }, select: { id: true } });
  if (taken)
    return { fieldErrors: { phone: "This number is already linked to another account." }, values: { phone: raw } };

  const res = await sendCode(user.id, "PHONE_VERIFY", phone).catch((err) => {
    console.error("[onboarding] sms failed:", err);
    return { ok: false as const, error: "We couldn't send a text to this number. Check it and try again." };
  });
  if (!res.ok) return { error: res.error, values: { phone: raw } };
  return { sentTo: phone, cooldown: RESEND_COOLDOWN_SECONDS };
}

export async function resendPhoneCode(): Promise<ResendState> {
  const { user } = await requireSession();
  if (!smsEnabled()) return continueOnboarding(user.id);
  const code = await activeCode(user.id, "PHONE_VERIFY");
  if (!code) return { error: "Enter your number again to get a new code." };
  const wait = cooldownRemaining(code);
  if (wait > 0) return { error: `Please wait ${wait}s before requesting a new code.`, cooldown: wait };
  const res = await sendCode(user.id, "PHONE_VERIFY", code.target).catch(() => ({
    ok: false as const,
    error: "We couldn't send the text. Please try again shortly.",
  }));
  return res.ok ? { message: "A new code is on its way.", cooldown: RESEND_COOLDOWN_SECONDS } : { error: res.error };
}

export async function verifyPhone(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const { user } = await requireSession();
  if (user.phoneVerifiedAt || !smsEnabled()) return continueOnboarding(user.id);

  const code = await activeCode(user.id, "PHONE_VERIFY");
  if (!code) return { error: "Your code expired. Enter your number again." };

  const result = await checkCode(user.id, "PHONE_VERIFY", String(fd.get("code") ?? ""));
  if (!result.ok) return { error: result.error };

  try {
    await db.user.update({ where: { id: user.id }, data: { phone: code.target, phoneVerifiedAt: new Date() } });
  } catch {
    // Unique constraint: someone verified this number in the meantime.
    return { error: "This number is already linked to another account." };
  }
  await logSecurityEvent("PHONE_VERIFIED", user.id);
  return continueOnboarding(user.id);
}

// ---------------------------------------------------------------------------
// Two-factor (step 4, optional)
// ---------------------------------------------------------------------------

export type TwoFactorState = FormState & { recoveryCodes?: string[] };

export async function enableTwoFactor(_prev: TwoFactorState | undefined, fd: FormData): Promise<TwoFactorState> {
  const { user } = await requireSession();
  const codes = await confirmTotpSetup(user.id, String(fd.get("code") ?? ""));
  if (!codes) return { error: "That code didn't match. Check the time on your phone and try the newest code." };
  await logSecurityEvent("TWO_FACTOR_ENABLED", user.id);
  return { recoveryCodes: codes };
}

export async function skipTwoFactor(): Promise<void> {
  const { user } = await requireSession();
  await db.user.update({
    where: { id: user.id },
    data: { twoFactorPromptedAt: new Date(), totpPendingSecretEnc: null },
  });
  redirect("/onboarding/kyc");
}

export async function finishTwoFactor(): Promise<void> {
  const { user } = await requireSession();
  redirect(user.totpEnabledAt ? "/onboarding/kyc" : ONBOARDING_PATHS["two-factor"]);
}

// ---------------------------------------------------------------------------
// Identity verification (step 5)
// ---------------------------------------------------------------------------

const kycSchema = z.object({
  documentType: z.enum(["PASSPORT", "NATIONAL_ID", "DRIVERS_LICENSE"], { error: "Choose a document type." }),
  documentCountry: z.string().refine((c) => COUNTRY_CODES.includes(c), "Choose the issuing country."),
});

export async function submitKyc(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const { user } = await requireSession();
  const step = nextOnboardingStep(user);
  if (step === "email" || step === "phone") redirect(ONBOARDING_PATHS[step]);
  if (user.kycStatus === "PENDING" || user.kycStatus === "APPROVED") redirect("/onboarding/kyc");

  const parsed = kycSchema.safeParse({
    documentType: fd.get("documentType"),
    documentCountry: fd.get("documentCountry"),
  });
  const values = {
    documentType: String(fd.get("documentType") ?? ""),
    documentCountry: String(fd.get("documentCountry") ?? ""),
  };
  if (!parsed.success) {
    const fe: Record<string, string> = {};
    for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message;
    return { fieldErrors: fe, values };
  }

  const rl = await rateLimit(`kyc:${user.id}`, limits.kycPerUser.limit, limits.kycPerUser.window);
  if (!rl.ok) return { error: `Too many submissions. Try again in ${formatRetry(rl.retryAfterSeconds)}.`, values };

  const needsBack = parsed.data.documentType !== "PASSPORT";
  const checks = await Promise.all([
    validateKycFile(fd.get("front"), "ID_FRONT"),
    needsBack ? validateKycFile(fd.get("back"), "ID_BACK") : null,
    validateKycFile(fd.get("selfie"), "SELFIE"),
  ]);
  const [front, back, selfie] = checks;
  const fieldErrors: Record<string, string> = {};
  if (!front.ok) fieldErrors.front = front.error;
  if (back && !back.ok) fieldErrors.back = back.error;
  if (!selfie.ok) fieldErrors.selfie = selfie.error;
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const files = checks.flatMap((c) => (c && c.ok ? [c.file] : [])) as ValidFile[];
  const submissionId = await createKycSubmission({ userId: user.id, ...parsed.data, files });
  await logSecurityEvent("KYC_SUBMITTED", user.id, { submissionId });
  redirect("/onboarding/kyc");
}
