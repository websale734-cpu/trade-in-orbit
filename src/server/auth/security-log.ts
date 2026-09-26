import "server-only";
import { db } from "../db";
import { getRequestInfo } from "../request-info";
import type { Prisma, SecurityEventType } from "@/generated/prisma/client";

/** Append an entry to the user's security log with the current request's device details. */
export async function logSecurityEvent(
  type: SecurityEventType,
  userId: string | null,
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  const info = await getRequestInfo();
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
}
