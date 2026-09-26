import "server-only";
import { headers } from "next/headers";
import { userAgent } from "next/server";

export type RequestInfo = {
  ip: string | null;
  userAgent: string | null;
  /** Human-readable device summary, e.g. "Chrome on Windows". */
  device: string | null;
  /** City/country when the hosting platform provides geo headers. */
  location: string | null;
};

/**
 * Details about the current request for the security log and sessions.
 *
 * The client IP comes from the first X-Forwarded-For hop, which is only
 * trustworthy behind a proxy that sets it (Vercel, Cloudflare, a load balancer).
 * Location uses platform geo headers when present; no third-party lookup.
 */
export async function getRequestInfo(): Promise<RequestInfo> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || h.get("cf-connecting-ip") || null;

  const ua = userAgent({ headers: h });
  const browser = ua.browser.name;
  const os = ua.os.name;
  const device =
    browser || os
      ? `${browser ?? "Unknown browser"} on ${os ?? "unknown OS"}${ua.device.type === "mobile" ? " (mobile)" : ""}`
      : null;

  const city = decodeHeader(h.get("x-vercel-ip-city") ?? h.get("cf-ipcity"));
  const country = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry");
  const location = [city, country].filter(Boolean).join(", ") || null;

  return { ip, userAgent: ua.ua || null, device, location };
}

function decodeHeader(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
