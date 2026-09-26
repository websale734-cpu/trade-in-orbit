import "server-only";
import { db } from "../db";
import { getRequestInfo } from "../request-info";
import { notify, type NotifyInput } from "../notify/notifications";
import type { Prisma, SecurityEventType } from "@/generated/prisma/client";

/** Append an entry to the user's security log with the current request's device details. */
export async function logSecurityEvent(
  type: SecurityEventType,
  userId: string | null,
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  const info = await getRequestInfo();

  // "New device" = no earlier successful sign-in from the same device description.
  const isNewDevice =
    type === "LOGIN_SUCCESS" && userId
      ? !(await db.securityEvent.findFirst({
          where: { userId, type: "LOGIN_SUCCESS", device: info.device },
          select: { id: true },
        }))
      : false;

  await db.securityEvent.create({
    data: {
      type,
      userId,
      ip: info.ip,
      userAgent: info.userAgent?.slice(0, 512),
      device: info.device,
      location: info.location,
      metadata,
    },
  });

  if (!userId) return;
  const message = notificationFor(type, info.device, info.location, isNewDevice);
  // A failed notification must never break the security action itself.
  if (message) await notify(userId, message).catch((err) => console.error("[notify]", err));
}

/** Which security events also notify the user (in-app + push). */
function notificationFor(
  type: SecurityEventType,
  device: string | null,
  location: string | null,
  isNewDevice: boolean,
): NotifyInput | null {
  const where = [device, location].filter(Boolean).join(", ") || "an unknown device";
  switch (type) {
    case "LOGIN_SUCCESS":
      return isNewDevice
        ? {
            type: "SECURITY",
            title: "New sign-in to your account",
            body: `Signed in from ${where}. If this wasn't you, reset your password now.`,
            link: "/settings/security",
          }
        : null;
    case "PASSWORD_RESET":
      return {
        type: "SECURITY",
        title: "Password changed",
        body: "Your password was reset and all devices were signed out.",
        link: "/settings/security",
      };
    case "TWO_FACTOR_ENABLED":
      return {
        type: "SECURITY",
        title: "Two-factor authentication on",
        body: "Your account now requires an authenticator code at login.",
        link: "/settings/security",
      };
    case "TWO_FACTOR_DISABLED":
      return {
        type: "SECURITY",
        title: "Two-factor authentication off",
        body: `2FA was turned off from ${where}. If this wasn't you, secure your account now.`,
        link: "/settings/security",
      };
    case "KYC_SUBMITTED":
      return {
        type: "KYC",
        title: "Documents received",
        body: "Your identity documents are in review. We'll let you know when it's done.",
        link: "/onboarding/kyc",
      };
    default:
      return null;
  }
}
