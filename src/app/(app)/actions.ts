"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { isDisplayCurrency } from "@/config/currencies";
import { pushConfigured, sendPushToUser } from "@/server/notify/notifications";

/** Add or remove an asset from the user's watchlist. Returns the new state. */
export async function toggleWatchlist(assetCode: string): Promise<{ watching: boolean }> {
  const { user } = await requireUser();
  const asset = await db.asset.findFirst({ where: { code: assetCode, enabled: true, type: "CRYPTO" } });
  if (!asset) return { watching: false };

  const existing = await db.watchlistItem.findUnique({ where: { userId_assetCode: { userId: user.id, assetCode } } });
  if (existing) await db.watchlistItem.delete({ where: { userId_assetCode: { userId: user.id, assetCode } } });
  else await db.watchlistItem.create({ data: { userId: user.id, assetCode } });

  revalidatePath("/dashboard");
  revalidatePath("/markets");
  return { watching: !existing };
}

export async function setDisplayCurrency(fd: FormData): Promise<void> {
  const { user } = await requireUser();
  const currency = String(fd.get("currency") ?? "").toLowerCase();
  if (!isDisplayCurrency(currency)) return;
  await db.user.update({ where: { id: user.id }, data: { currency } });
  revalidatePath("/dashboard");
}

// ---------------------------------------------------------------------------
// Reviews (moderated before they appear publicly)
// ---------------------------------------------------------------------------

export async function submitReview(
  _prev: { error?: string; message?: string } | undefined,
  fd: FormData,
): Promise<{ error?: string; message?: string }> {
  const { user } = await requireUser();
  const parsed = z
    .object({
      rating: z.coerce.number().int().min(1).max(5),
      body: z.string().trim().min(20, "Tell us a bit more (at least 20 characters).").max(600),
    })
    .safeParse({ rating: fd.get("rating"), body: fd.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (await db.testimonial.findFirst({ where: { userId: user.id, status: { in: ["PENDING", "APPROVED"] } } }))
    return { error: "You've already shared a review. Thank you!" };
  // Public name is first name + last initial, so reviews stay personal but private.
  const [first, ...rest] = user.name.split(/\s+/);
  const displayName = rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
  await db.testimonial.create({ data: { userId: user.id, displayName, ...parsed.data } });
  revalidatePath("/dashboard");
  return { message: "Thanks! Your review will appear once our team has checked it." };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export async function markAllNotificationsRead(): Promise<void> {
  const { user } = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

export async function markNotificationRead(id: string): Promise<void> {
  const { user } = await requireUser();
  await db.notification.updateMany({ where: { id, userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

const subscriptionSchema = z.object({
  endpoint: z.url().refine((u) => u.startsWith("https://"), "Push endpoints must be https"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});

/** Store this browser's Web Push subscription for the signed-in user. */
export async function savePushSubscription(sub: unknown, userAgent: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireUser();
  if (!pushConfigured()) return { ok: false, error: "Push notifications aren't configured on this server." };
  const parsed = subscriptionSchema.safeParse(sub);
  if (!parsed.success) return { ok: false, error: "Invalid subscription." };
  const { endpoint, keys } = parsed.data;
  // The endpoint identifies the browser; re-subscribing moves it to the current user.
  await db.pushSubscription.upsert({
    where: { endpoint },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent.slice(0, 300) },
    create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: userAgent.slice(0, 300) },
  });
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const { user } = await requireUser();
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
}

export async function sendTestPush(): Promise<{ sent: number }> {
  const { user } = await requireUser();
  const { sent } = await sendPushToUser(user.id, {
    title: "Orbtrade test notification",
    body: "Push notifications are working on this device.",
    link: "/notifications",
  });
  return { sent };
}
