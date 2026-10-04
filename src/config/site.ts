/**
 * Site-wide constants. Values that differ per deployment come from env vars
 * (see .env.example); everything else lives here.
 */
export const siteConfig = {
  name: "Trade In Orbit",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@tradeinorbit.com",
  /** Inbox that receives Contact page messages (server-side only). */
  contactInbox: "support@tradeinorbit.com",
  /** Shown in the help centre (Phase 7). Leave empty to hide. */
  supportPhone: process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? "",
} as const;

export const legalPages = ["terms", "privacy", "risk", "aml"] as const;
export type LegalPage = (typeof legalPages)[number];
