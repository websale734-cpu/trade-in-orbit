import "server-only";
import { env } from "../env";
import { siteConfig } from "@/config/site";

/**
 * Transactional email.
 *
 * Providers (EMAIL_PROVIDER):
 *   - resend   : Resend HTTP API (RESEND_API_KEY)
 *   - sendgrid : SendGrid v3 HTTP API (SENDGRID_API_KEY)
 *   - console  : development only; prints the email to the server console
 */
export type EmailMessage = { to: string; subject: string; text: string; html: string };

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const e = env();
  switch (e.EMAIL_PROVIDER) {
    case "console":
      console.info(`\n[email:console] To: ${msg.to}\nSubject: ${msg.subject}\n${msg.text}\n`);
      return;
    case "resend": {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: e.EMAIL_FROM,
          to: [msg.to],
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
      return;
    }
    case "sendgrid": {
      const from = parseAddress(e.EMAIL_FROM);
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${e.SENDGRID_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: msg.to }] }],
          from,
          subject: msg.subject,
          content: [
            { type: "text/plain", value: msg.text },
            { type: "text/html", value: msg.html },
          ],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`SendGrid failed: ${res.status} ${await res.text()}`);
      return;
    }
  }
}

function parseAddress(value: string): { email: string; name?: string } {
  const m = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || undefined, email: m[2] } : { email: value.trim() };
}

// ---------------------------------------------------------------------------
// Templates. Plain, inline-styled HTML that renders in every mail client.
// ---------------------------------------------------------------------------

function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#07070c;font-family:Inter,Segoe UI,Arial,sans-serif;color:#ededf5">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0d0d15;border:1px solid #23232f;border-radius:16px;padding:32px">
<tr><td style="font-size:20px;font-weight:600;padding-bottom:24px"><span style="color:#a78bfa">●</span> Trade In Orbit</td></tr>
<tr><td style="font-size:18px;font-weight:600;padding-bottom:12px">${title}</td></tr>
<tr><td style="font-size:14px;line-height:1.6;color:#b5b5c9">${body}</td></tr>
<tr><td style="font-size:12px;color:#6b6b85;padding-top:28px">If you didn't request this, you can ignore this email. Trade In Orbit will never ask for your password or codes by phone, email or chat.</td></tr>
</table></td></tr></table></body></html>`;
}

/** Escape text before it goes into an HTML email (defence in depth: callers pass app-generated text). */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function codeBlock(code: string): string {
  return `<div style="margin:20px 0;padding:16px;text-align:center;font-size:32px;letter-spacing:10px;font-weight:700;background:#15151f;border-radius:12px;color:#fff">${code}</div>`;
}

export function verificationCodeEmail(to: string, code: string, minutes: number): EmailMessage {
  return {
    to,
    subject: `${code} is your Trade In Orbit verification code`,
    text: `Your Trade In Orbit verification code is ${code}. It expires in ${minutes} minutes.`,
    html: layout(
      "Verify your email",
      `Enter this code to verify your email address:${codeBlock(code)}It expires in ${minutes} minutes.`,
    ),
  };
}

export function passwordResetEmail(to: string, code: string, minutes: number): EmailMessage {
  return {
    to,
    subject: `${code} is your Trade In Orbit password reset code`,
    text: `Your Trade In Orbit password reset code is ${code}. It expires in ${minutes} minutes. If you didn't ask to reset your password, you can ignore this email.`,
    html: layout(
      "Reset your password",
      `Use this code to reset your password:${codeBlock(code)}It expires in ${minutes} minutes.`,
    ),
  };
}

export function priceAlertEmail(to: string, asset: string, body: string): EmailMessage {
  return {
    to,
    subject: `${asset} price alert`,
    text: `${body}\n\nManage alerts: ${siteConfig.url}/alerts`,
    html: layout(`${esc(asset)} price alert`, `${esc(body)}<br><br><a style="color:#a78bfa" href="${siteConfig.url}/alerts">Manage your alerts</a>`),
  };
}

export function simpleNoticeEmail(to: string, subject: string, body: string, linkPath: string, linkLabel: string): EmailMessage {
  return {
    to,
    subject,
    text: `${body}\n\n${linkLabel}: ${siteConfig.url}${linkPath}`,
    html: layout(esc(subject), `${esc(body)}<br><br><a style="color:#a78bfa" href="${siteConfig.url}${esc(linkPath)}">${esc(linkLabel)}</a>`),
  };
}

/** Code for a sensitive action (withdrawal, new withdrawal address). */
export function confirmActionEmail(to: string, code: string, minutes: number, action: string): EmailMessage {
  return {
    to,
    subject: `${code} is your Trade In Orbit security code`,
    text: `Use ${code} to ${action}. It expires in ${minutes} minutes. If you didn't request this, secure your account and contact support.`,
    html: layout(
      "Confirm it's you",
      `Use this code to ${action}:${codeBlock(code)}It expires in ${minutes} minutes. <strong>If you didn't request this, change your password immediately.</strong>`,
    ),
  };
}

export function passwordChangedEmail(to: string): EmailMessage {
  const help = `${siteConfig.url}/help`;
  return {
    to,
    subject: "Your Trade In Orbit password was changed",
    text: `The password for your Trade In Orbit account was just changed and all devices were signed out. If this wasn't you, contact support immediately: ${help}`,
    html: layout(
      "Your password was changed",
      `The password for your account was just changed and all devices were signed out.<br><br>If this wasn't you, <a style="color:#a78bfa" href="${help}">contact support</a> immediately.`,
    ),
  };
}
