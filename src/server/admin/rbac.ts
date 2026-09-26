import "server-only";
import { redirect } from "next/navigation";
import { db } from "../db";
import { requireSession } from "../auth/dal";
import { getRequestInfo } from "../request-info";
import type { Prisma, Role, User } from "@/generated/prisma/client";

/**
 * Admin role-based access control.
 *
 * Roles (least to most privileged):
 *   SUPPORT     - look up users and transactions
 *   COMPLIANCE  - + KYC review, deposit/withdrawal queues, suspensions, audit log
 *   ADMIN       - + settings, coins, content, testimonials, balance adjustments
 *   SUPER_ADMIN - + manage staff roles
 *
 * Staff must have two-factor authentication enabled to enter the admin area.
 * Every admin page and Server Action checks its permission server-side, and
 * every state change is written to the append-only audit log.
 */
export const PERMISSIONS = {
  "users.view": ["SUPPORT", "COMPLIANCE", "ADMIN", "SUPER_ADMIN"],
  "transactions.view": ["SUPPORT", "COMPLIANCE", "ADMIN", "SUPER_ADMIN"],
  "support.manage": ["SUPPORT", "COMPLIANCE", "ADMIN", "SUPER_ADMIN"],
  "listings.view": ["COMPLIANCE", "ADMIN", "SUPER_ADMIN"],
  "users.suspend": ["COMPLIANCE", "ADMIN", "SUPER_ADMIN"],
  "kyc.review": ["COMPLIANCE", "ADMIN", "SUPER_ADMIN"],
  "payments.review": ["COMPLIANCE", "ADMIN", "SUPER_ADMIN"],
  "audit.view": ["COMPLIANCE", "ADMIN", "SUPER_ADMIN"],
  "ledger.adjust": ["ADMIN", "SUPER_ADMIN"],
  "settings.manage": ["ADMIN", "SUPER_ADMIN"],
  "content.manage": ["ADMIN", "SUPER_ADMIN"],
  "roles.manage": ["SUPER_ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function isStaff(user: Pick<User, "role">): boolean {
  return user.role !== "USER";
}

export function can(user: Pick<User, "role">, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(user.role);
}

/** Signed-in staff member with 2FA, or redirected away. */
export async function requireStaff() {
  const session = await requireSession("/admin");
  if (!isStaff(session.user)) redirect("/dashboard");
  if (!session.user.totpEnabledAt) redirect("/settings/security?setup=2fa&reason=admin");
  return session;
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Missing permission: ${permission}`);
  }
}

/** For pages: staff with a specific permission, or a 403-style redirect. */
export async function requirePermission(permission: Permission) {
  const session = await requireStaff();
  if (!can(session.user, permission)) redirect("/admin?denied=1");
  return session;
}

/** For Server Actions: throws instead of redirecting. */
export async function assertPermission(permission: Permission) {
  const session = await requireStaff();
  if (!can(session.user, permission)) throw new ForbiddenError(permission);
  return session.user;
}

/** Append to the admin audit log. */
export async function audit(
  actor: Pick<User, "id">,
  action: string,
  target?: { type: string; id: string },
  details?: Prisma.InputJsonValue,
) {
  const { ip } = await getRequestInfo();
  await db.adminAuditLog.create({
    data: { actorId: actor.id, action, targetType: target?.type, targetId: target?.id, details, ip },
  });
}
