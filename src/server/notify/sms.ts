import "server-only";
import { env } from "../env";
import { randomCode } from "../crypto";

/**
 * SMS verification codes.
 *
 * Providers (SMS_PROVIDER):
 *   - twilio  : Twilio Verify. Twilio generates, sends and checks the code, so we
 *               never see it. Orbtrade still enforces its own expiry, resend
 *               cooldown and attempt limits in the database.
 *   - console : development only. We generate the code, print it to the server
 *               console and verify it ourselves.
 */
export type SmsStartResult =
  /** Provider owns the code (Twilio Verify). */
  | { mode: "provider" }
  /** We own the code; store its hash and compare on check. */
  | { mode: "local"; code: string };

export async function startSmsVerification(phone: string): Promise<SmsStartResult> {
  const e = env();
  if (e.SMS_PROVIDER === "console") {
    const code = randomCode();
    console.info(`\n[sms:console] To: ${phone}\nYour Orbtrade verification code is ${code}\n`);
    return { mode: "local", code };
  }
  await twilio(`Services/${e.TWILIO_VERIFY_SERVICE_SID}/Verifications`, { To: phone, Channel: "sms" });
  return { mode: "provider" };
}

/** Check a code with Twilio Verify. Only used in "provider" mode. */
export async function checkSmsVerification(phone: string, code: string): Promise<boolean> {
  const e = env();
  try {
    const res = await twilio(`Services/${e.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`, { To: phone, Code: code });
    return res.status === "approved";
  } catch (err) {
    // Twilio returns 404 once a verification has expired or been approved.
    if (err instanceof TwilioError && err.status === 404) return false;
    throw err;
  }
}

class TwilioError extends Error {
  constructor(
    public status: number,
    body: string,
  ) {
    super(`Twilio Verify responded ${status}: ${body}`);
  }
}

async function twilio(path: string, params: Record<string, string>): Promise<{ status?: string }> {
  const e = env();
  const auth = Buffer.from(`${e.TWILIO_ACCOUNT_SID}:${e.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://verify.twilio.com/v2/${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new TwilioError(res.status, await res.text());
  return (await res.json()) as { status?: string };
}
