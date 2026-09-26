import "server-only";
import webpush from "web-push";
import { db } from "../db";
import type { NotificationType } from "@/generated/prisma/client";

/**
 * In-app notifications, mirrored to Web Push on every device the user has
 * subscribed. Push is best-effort: a failed or expired subscription never
 * blocks the action that triggered the notification.
 *
 * Push needs VAPID keys (NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
 * VAPID_SUBJECT). Without them notifications are in-app only.
 */
export type NotifyInput = { type: NotificationType; title: string; body: string; link?: string };

let vapidReady: boolean | null = null;
function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  vapidReady = !!(pub && priv && subject);
  if (vapidReady) webpush.setVapidDetails(subject!, pub!, priv!);
  return vapidReady;
}

export function pushConfigured(): boolean {
  return ensureVapid();
}

export async function notify(userId: string, input: NotifyInput): Promise<void> {
  const created = await db.notification.create({ data: { userId, ...input } });
  await sendPushToUser(userId, {
    id: created.id,
    title: input.title,
    body: input.body,
    link: input.link ?? "/notifications",
  });
}

export async function sendPushToUser(
  userId: string,
  payload: { id?: string; title: string; body: string; link: string },
): Promise<{ sent: number; removed: number }> {
  if (!ensureVapid()) return { sent: 0, removed: 0 };
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  let removed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60, urgency: "normal" },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410: the browser has dropped this subscription, so forget it.
        if (status === 404 || status === 410) {
          await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          removed++;
        } else {
          console.error("[push] send failed:", status ?? err);
        }
      }
    }),
  );
  return { sent, removed };
}

export function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

export function latestNotifications(userId: string, take = 20) {
  return db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}
