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
// Templates. Table-based, inline-styled HTML that renders in every mail client.
// Light by default. A prefers-color-scheme block re-colours it for apps that
// honour it (Apple Mail, iOS Mail, Outlook), and the light colours are picked
// to survive the automatic inversion Gmail's mobile apps apply instead. Every
// gradient and image sits on a solid colour, so clients that drop them (Outlook
// for Windows, blocked images) still get a finished-looking email.
// Images live in public/email/ and are loaded from the live site.
// ---------------------------------------------------------------------------

const DEFAULT_FOOTER =
  "If you didn't request this, you can ignore this email. Trade In Orbit will never ask for your password or codes by phone, email or chat.";

const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const BRAND = "#6d28d9";
const BRAND_GRADIENT = "linear-gradient(120deg,#7c3aed 0%,#6366f1 55%,#2563eb 100%)";
const HAIRLINE_GRADIENT = "linear-gradient(90deg,rgba(139,92,246,0) 0%,#a78bfa 30%,#60a5fa 70%,rgba(37,99,235,0) 100%)";

type Icon = "mail" | "key" | "lock" | "shield" | "bell" | "check" | "cross";

/** Dark-mode colours, keyed by the class each element carries alongside its inline light colours. */
const DARK_RULES: [cls: string, css: string][] = [
  ["o-bg", "background:#07070c linear-gradient(180deg,#171030 0%,#07070c 380px) no-repeat!important"],
  ["o-card", "background:#11111a!important;border-color:#26233d!important;box-shadow:0 24px 48px -16px rgba(0,0,0,.7)!important"],
  ["o-title", "color:#f5f4fc!important"],
  ["o-text", "color:#bdbbd2!important"],
  ["o-muted", "color:#7f7c99!important"],
  ["o-brand", "color:#e4e2f0!important"],
  ["o-rule", "border-color:#26233d!important"],
  ["o-hair", "background-color:#2c2747!important"],
  ["o-link", "color:#b4a0ff!important"],
  ["o-code", "background:#140f26!important"],
  ["o-digits", "color:#ffffff!important"],
  ["o-panel", "background:#15131f!important;border-color:#26233d!important"],
  ["o-hero", "background:#1a1530 linear-gradient(135deg,#221a42 0%,#151a36 100%)!important"],
  ["o-label", "color:#9a97b4!important"],
  ["o-value", "color:#efeef7!important"],
  ["o-ok", "background:#0e2e23!important;color:#34d399!important"],
  ["o-bad", "background:#3a1220!important;color:#fb7185!important"],
  ["o-warn", "background:#2a0f19!important;border-color:#4d1a2c!important;color:#fda4b4!important"],
  ["o-warnlink", "color:#fecdd6!important"],
];

// Separate blocks so a client that rejects one rule (Gmail drops a whole block
// it can't parse) keeps the others. The last is Outlook.com's dark-mode hook.
const STYLES =
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">` +
  `<style>:root{color-scheme:light dark;supported-color-schemes:light dark}body{margin:0;padding:0;-webkit-text-size-adjust:100%}` +
  `@media (max-width:600px){.o-outer{padding:24px 10px!important}.o-pad{padding-left:24px!important;padding-right:24px!important}.o-digits{font-size:32px!important;letter-spacing:9px!important;padding-left:9px!important}.o-amount{font-size:24px!important}}</style>` +
  `<style>@media (prefers-color-scheme:dark){${DARK_RULES.map(([c, css]) => `.${c}{${css}}`).join("")}}</style>` +
  `<style>${DARK_RULES.map(([c, css]) => `[data-ogsc] .${c},[data-ogsb] .${c}{${css}}`).join("")}</style>` +
  // Outlook for Windows ignores the fallback stack when the first font is missing.
  `<!--[if mso]><style>*{font-family:Arial,sans-serif!important}</style><![endif]-->`;

const asset = (file: string) => `${siteConfig.url}/email/${file}`;

/** A 1px brand-gradient rule. */
function hairline(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="o-hair" height="1" style="height:1px;line-height:1px;font-size:0;background-color:#e6e1f6;background-image:${HAIRLINE_GRADIENT}">&nbsp;</td></tr></table>`;
}

function layout(title: string, body: string, opts: { icon?: Icon; footer?: string } = {}): string {
  const footer = opts.footer ?? DEFAULT_FOOTER;
  const url = siteConfig.url;
  const host = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const icon = opts.icon
    ? `<img src="${asset(`icon-${opts.icon}.png`)}" width="56" height="56" alt="" style="display:block;width:56px;height:56px;border:0;margin:0 0 22px">`
    : "";
  const footLink = (path: string, label: string) =>
    `<a class="o-link" href="${url}${path}" style="color:#6d28d9;font-weight:600;text-decoration:none">${label}</a>`;
  const dot = `<span class="o-muted" style="color:#b3afc8">&nbsp;&middot;&nbsp;</span>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${title}</title>${STYLES}</head>
<body class="o-bg" style="margin:0;padding:0;background:#f1eff8">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="o-bg" bgcolor="#f1eff8" style="background:#f1eff8 linear-gradient(180deg,#e4ddfb 0%,#f1eff8 380px) no-repeat"><tr><td align="center" class="o-outer" style="padding:44px 16px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
<tr><td class="o-card" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e4e0f2;border-radius:22px;box-shadow:0 1px 2px rgba(24,16,63,.05),0 24px 48px -18px rgba(76,29,149,.28)">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" background="${asset("header.jpg")}" bgcolor="#5b21b6" style="background-color:#5b21b6;background-image:${BRAND_GRADIENT};background-image:url('${asset("header.jpg")}'),${BRAND_GRADIENT};background-size:cover;background-position:center;border-radius:21px 21px 0 0;padding:36px 24px 32px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="64" height="64" align="center" valign="middle" bgcolor="#ffffff" style="width:64px;height:64px;background:#ffffff;border-radius:18px;box-shadow:0 12px 28px rgba(20,8,64,.35)"><img src="${asset("logo.png")}" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border:0"></td></tr></table>
<div style="margin-top:14px;font-family:${FONT};font-size:21px;line-height:1.2;font-weight:700;letter-spacing:-0.3px;color:#ffffff">Trade In Orbit</div>
</td></tr>
<tr><td class="o-pad" style="padding:40px 44px 8px">
${icon}<h1 class="o-title" style="margin:0 0 14px;font-family:${FONT};font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-0.4px;color:#13111f">${title}</h1>
<div class="o-text" style="font-family:${FONT};font-size:15px;line-height:1.7;color:#4b4865">${body}</div>
</td></tr>
<tr><td class="o-pad" style="padding:30px 44px 0">${hairline()}</td></tr>
<tr><td class="o-pad o-muted" style="padding:20px 44px 34px;font-family:${FONT};font-size:12px;line-height:1.65;color:#8b88a3">${footer}</td></tr>
</table></td></tr>
<tr><td align="center" style="padding:34px 16px 0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle"><img src="${asset("logo.png")}" width="26" height="26" alt="" style="display:block;width:26px;height:26px;border:0"></td><td valign="middle" class="o-brand" style="padding-left:8px;font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:-0.2px;color:#2a2740">Trade In Orbit</td></tr></table>
</td></tr>
<tr><td align="center" style="padding:12px 16px 0;font-family:${FONT};font-size:13px;line-height:1.6">${footLink("/help", "Help centre")}${dot}${footLink("/legal/privacy", "Privacy")}${dot}${footLink("/legal/terms", "Terms")}</td></tr>
<tr><td align="center" style="padding:16px 0 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="48" height="3" bgcolor="${BRAND}" style="width:48px;height:3px;line-height:3px;font-size:0;background:${BRAND};background-image:${BRAND_GRADIENT};border-radius:3px">&nbsp;</td></tr></table></td></tr>
<tr><td align="center" class="o-muted" style="padding:14px 16px 0;font-family:${FONT};font-size:12px;line-height:1.7;color:#8b88a3">&copy; ${new Date().getFullYear()} Trade In Orbit &middot; <a class="o-muted" href="${url}" style="color:#8b88a3;text-decoration:underline">${esc(host)}</a></td></tr>
</table></td></tr></table></body></html>`;
}

/** Escape text before it goes into an HTML email (defence in depth: callers pass app-generated text). */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

/** The code in a gradient-framed card, with its expiry line underneath. */
function codeCard(code: string, note: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 6px"><tr><td bgcolor="${BRAND}" style="background:${BRAND};background-image:${BRAND_GRADIENT};border-radius:18px;padding:2px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" class="o-code" bgcolor="#faf8ff" style="background:#faf8ff;border-radius:16px;padding:28px 16px 22px">
<div class="o-digits" style="font-family:${FONT};font-size:40px;line-height:1;font-weight:700;letter-spacing:12px;padding-left:12px;font-variant-numeric:tabular-nums;color:#3b1d8f">${code}</div>
<div class="o-muted" style="margin-top:16px;font-family:${FONT};font-size:13px;line-height:1.5;color:#8b88a3">${note}</div>
</td></tr></table></td></tr></table>`;
}

/** A tinted box for the "if this wasn't you" warnings. */
function callout(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0"><tr><td class="o-warn" bgcolor="#fff3f5" style="background:#fff3f5;border:1px solid #fbd3dc;border-radius:14px;padding:14px 18px;font-family:${FONT};font-size:14px;line-height:1.6;color:#9f1239">${html}</td></tr></table>`;
}

/** A bulletproof gradient button: the label stays clickable and legible even where the gradient is dropped. */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 4px"><tr><td bgcolor="${BRAND}" style="background:${BRAND};background-image:${BRAND_GRADIENT};border-radius:12px;box-shadow:0 10px 24px -8px rgba(91,33,182,.55)"><a href="${href}" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:12px">${label}</a></td></tr></table>`;
}

function inlineLink(href: string, label: string, cls = "o-link", color = "#6d28d9"): string {
  return `<a class="${cls}" href="${href}" style="color:${color};font-weight:600;text-decoration:underline">${label}</a>`;
}

const statusTone = (value: string) =>
  /^(success|approved)$/i.test(value) ? "ok" : /^(failed|rejected)$/i.test(value) ? "bad" : null;

/** Status values get a coloured pill; anything else reads as plain text. */
function statusPill(value: string): string {
  const tone = statusTone(value);
  if (!tone) return esc(value);
  const [bg, fg] = tone === "ok" ? ["#e3f6ee", "#047857"] : ["#fdebef", "#be123c"];
  return `<span class="o-${tone}" style="display:inline-block;padding:4px 12px;border-radius:999px;background:${bg};color:${fg};font-size:13px;font-weight:600;line-height:1.4">${esc(value)}</span>`;
}

/** Details table. A leading Amount row is pulled out as a large figure on a brand-tinted band. */
function detailsPanel(details: [string, string][]): string {
  const [first, ...others] = details;
  const hero = first[0] === "Amount" ? first : null;
  const rows = (hero ? others : details)
    .map(([k, v], i) => {
      const rule = i ? "border-top:1px solid #ece9f6;" : "";
      return `<tr><td class="o-label o-rule" valign="top" style="${rule}padding:13px 0;font-family:${FONT};font-size:14px;color:#6c6987">${esc(k)}</td><td align="right" class="o-value o-rule" style="${rule}padding:13px 0 13px 16px;font-family:${FONT};font-size:14px;font-weight:600;color:#13111f;text-align:right">${k === "Status" ? statusPill(v) : esc(v)}</td></tr>`;
    })
    .join("");
  const heroHtml = hero
    ? `<tr><td class="o-hero" bgcolor="#f3f0ff" style="background:#f3f0ff linear-gradient(135deg,#f1ebff 0%,#e9efff 100%);border-radius:15px 15px 0 0;padding:20px 22px">
<div class="o-label" style="font-family:${FONT};font-size:12px;line-height:1.4;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#6c6987">${esc(hero[0])}</div>
<div class="o-value o-amount" style="margin-top:6px;font-family:${FONT};font-size:28px;line-height:1.2;font-weight:700;letter-spacing:-0.5px;font-variant-numeric:tabular-nums;color:#13111f">${esc(hero[1])}</div>
</td></tr>${rows ? `<tr><td>${hairline()}</td></tr>` : ""}`
    : "";
  const body = rows
    ? `<tr><td style="padding:4px 22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="o-panel" bgcolor="#fbfaff" style="margin:24px 0 2px;background:#fbfaff;border:1px solid #e9e5f6;border-radius:16px">${heroHtml}${body}</table>`;
}

export function verificationCodeEmail(to: string, code: string, minutes: number): EmailMessage {
  return {
    to,
    subject: `${code} is your Trade In Orbit verification code`,
    text: `Your Trade In Orbit verification code is ${code}. It expires in ${minutes} minutes.`,
    html: layout(
      "Verify your email",
      `Enter this code to verify your email address:${codeCard(code, `It expires in ${minutes} minutes.`)}`,
      { icon: "mail" },
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
      `Use this code to reset your password:${codeCard(code, `It expires in ${minutes} minutes.`)}`,
      { icon: "key" },
    ),
  };
}

export function priceAlertEmail(to: string, asset: string, body: string): EmailMessage {
  return {
    to,
    subject: `${asset} price alert`,
    text: `${body}\n\nManage alerts: ${siteConfig.url}/alerts`,
    html: layout(`${esc(asset)} price alert`, `${esc(body)}${button(`${siteConfig.url}/alerts`, "Manage your alerts")}`, { icon: "bell" }),
  };
}

export function simpleNoticeEmail(to: string, subject: string, body: string, linkPath: string, linkLabel: string): EmailMessage {
  return {
    to,
    subject,
    text: `${body}\n\n${linkLabel}: ${siteConfig.url}${linkPath}`,
    html: layout(esc(subject), `${esc(body)}${button(`${siteConfig.url}${esc(linkPath)}`, esc(linkLabel))}`, { icon: "bell" }),
  };
}

/**
 * An admin decision on the customer's deposit, withdrawal or verification:
 * a heading, a sentence, a small details table (amount, coin, status) and a link.
 */
export function decisionEmail(
  to: string,
  msg: { subject: string; body: string; details: [string, string][]; linkPath: string; linkLabel: string },
): EmailMessage {
  const url = `${siteConfig.url}${msg.linkPath}`;
  const tone = statusTone(msg.details.find(([k]) => k === "Status")?.[1] ?? "");
  return {
    to,
    subject: msg.subject,
    text: `${msg.body}\n\n${msg.details.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${msg.linkLabel}: ${url}`,
    html: layout(
      esc(msg.subject),
      `${esc(msg.body)}${msg.details.length ? detailsPanel(msg.details) : ""}${button(esc(url), esc(msg.linkLabel))}`,
      {
        icon: tone === "ok" ? "check" : tone === "bad" ? "cross" : "bell",
        footer:
          "Questions about this? Reply from the Support page in the app. Trade In Orbit will never ask for your password or codes by phone, email or chat.",
      },
    ),
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
      `Use this code to ${action}:${codeCard(code, `It expires in ${minutes} minutes.`)}${callout("<strong>If you didn't request this, change your password immediately.</strong>")}`,
      { icon: "shield" },
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
      `The password for your account was just changed and all devices were signed out.${callout(`If this wasn't you, ${inlineLink(help, "contact support", "o-warnlink", "#9f1239")} immediately.`)}`,
      { icon: "lock" },
    ),
  };
}
