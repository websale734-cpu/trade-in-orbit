import "server-only";
import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";
import { db } from "../db";
import { randomBytes } from "node:crypto";
import { decryptString, encryptString, hmac, safeEqual } from "../crypto";

/**
 * Authenticator-app 2FA (RFC 6238 TOTP: SHA-1, 6 digits, 30 s — what Google
 * Authenticator, 1Password, Authy, etc. expect). Secrets are encrypted at rest.
 */
const ISSUER = "Trade In Orbit";

function totpFor(secretBase32: string, label: string) {
  return new TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

/**
 * Start (or resume) setup and return what the user needs to scan. An existing
 * pending secret is reused, so reloading the page doesn't invalidate a QR code
 * the user has already scanned.
 */
export async function beginTotpSetup(userId: string, email: string, pendingSecretEnc: string | null) {
  let base32: string;
  if (pendingSecretEnc) {
    base32 = decryptString(pendingSecretEnc);
  } else {
    base32 = new Secret({ size: 20 }).base32;
    await db.user.update({ where: { id: userId }, data: { totpPendingSecretEnc: encryptString(base32) } });
  }
  const uri = totpFor(base32, email).toString();
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: "M" });
  return { qrDataUrl, manualKey: base32.match(/.{1,4}/g)!.join(" ") };
}

const PERIOD_SECONDS = 30;

/**
 * The absolute 30-second time step the code belongs to, or null if it doesn't
 * match. Allows one step of clock drift either way.
 */
function matchStep(secretEnc: string, code: string): number | null {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) return null;
  const delta = totpFor(decryptString(secretEnc), "user").validate({ token: clean, window: 1 });
  if (delta === null) return null;
  return Math.floor(Date.now() / 1000 / PERIOD_SECONDS) + delta;
}

/** Whether a code would be accepted right now, without marking it as used. */
export function totpWouldAccept(secretEnc: string, lastStep: number | null, code: string): boolean {
  const step = matchStep(secretEnc, code);
  return step !== null && (lastStep === null || step > lastStep);
}

/**
 * Verify a code for an account with 2FA enabled and mark its time step as used.
 * Each code works once: a code at or before the last accepted step is rejected,
 * so a code seen over someone's shoulder can't be replayed within its window.
 */
export async function verifyAndConsumeTotp(userId: string, secretEnc: string, code: string): Promise<boolean> {
  const step = matchStep(secretEnc, code);
  if (step === null) return false;
  // Conditional update: two parallel requests with the same code can't both succeed.
  const { count } = await db.user.updateMany({
    where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  return count === 1;
}

/**
 * Confirm setup with a code from the app. On success 2FA is enabled and ten
 * single-use recovery codes are returned; they're shown to the user once.
 */
export async function confirmTotpSetup(userId: string, code: string): Promise<string[] | null> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.totpPendingSecretEnc) return null;
  const step = matchStep(user.totpPendingSecretEnc, code);
  if (step === null) return null;

  // 10 codes × 40 bits each, formatted "abcde-12345".
  const recovery = Array.from({ length: 10 }, () => formatRecovery(randomBytes(5).toString("hex")));
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: {
        totpSecretEnc: user.totpPendingSecretEnc,
        totpPendingSecretEnc: null,
        totpEnabledAt: new Date(),
        // The setup code counts as used, so it can't also be used to log in.
        totpLastStep: step,
        twoFactorPromptedAt: user.twoFactorPromptedAt ?? new Date(),
      },
    }),
    db.recoveryCode.deleteMany({ where: { userId } }),
    db.recoveryCode.createMany({ data: recovery.map((c) => ({ userId, codeHash: hmac("recovery", normalise(c)) })) }),
  ]);
  return recovery;
}

export async function disableTotp(userId: string): Promise<void> {
  await db.$transaction([
    db.user.update({
      where: { id: userId },
      data: { totpSecretEnc: null, totpPendingSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
    }),
    db.recoveryCode.deleteMany({ where: { userId } }),
  ]);
}

/** Use a recovery code (single use). Returns true if it was valid and unused. */
export async function consumeRecoveryCode(userId: string, input: string): Promise<boolean> {
  const hash = hmac("recovery", normalise(input));
  const codes = await db.recoveryCode.findMany({ where: { userId, usedAt: null } });
  const match = codes.find((c) => safeEqual(c.codeHash, hash));
  if (!match) return false;
  const { count } = await db.recoveryCode.updateMany({
    where: { id: match.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1;
}

function normalise(code: string) {
  return code.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function formatRecovery(hex10: string) {
  return `${hex10.slice(0, 5)}-${hex10.slice(5)}`;
}
