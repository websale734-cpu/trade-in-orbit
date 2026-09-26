"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/dal";
import { verifyPassword } from "@/server/auth/password";
import { logSecurityEvent } from "@/server/auth/security-log";
import { formatRetry, rateLimit } from "@/server/rate-limit";
import { createApiKey, MAX_KEYS } from "@/server/api-keys";
import { notify } from "@/server/notify/notifications";
import type { FormState } from "@/components/ui/form";

export type CreateKeyState = FormState & { token?: string };

export async function createKey(_prev: CreateKeyState | undefined, fd: FormData): Promise<CreateKeyState> {
  const { user } = await requireUser();
  const values = { name: String(fd.get("name") ?? ""), permission: String(fd.get("permission") ?? "") };
  const parsed = z
    .object({ name: z.string().trim().min(2, "Name the key (e.g. the app that uses it).").max(40), permission: z.enum(["READ", "TRADE"]) })
    .safeParse(values);
  if (!parsed.success) return { fieldErrors: { name: parsed.error.issues[0].message }, values };

  // Re-authenticate: creating a key grants lasting access to the account.
  const rl = await rateLimit(`apikey:pw:${user.id}`, 5, 900);
  if (!rl.ok) return { error: `Too many attempts. Try again in ${formatRetry(rl.retryAfterSeconds)}.`, values };
  if (!(await verifyPassword(user.passwordHash, String(fd.get("password") ?? ""))))
    return { fieldErrors: { password: "Incorrect password." }, values };

  const active = await db.apiKey.count({ where: { userId: user.id, revokedAt: null } });
  if (active >= MAX_KEYS) return { error: `You can have up to ${MAX_KEYS} active keys. Revoke one first.`, values };

  const { id, token } = await createApiKey(user.id, parsed.data.name, parsed.data.permission);
  await logSecurityEvent("API_KEY_CREATED", user.id, { keyId: id, permission: parsed.data.permission });
  await notify(user.id, {
    type: "SECURITY",
    title: "New API key created",
    body: `A ${parsed.data.permission === "TRADE" ? "trading" : "read-only"} API key "${parsed.data.name}" was created. If this wasn't you, revoke it and change your password.`,
    link: "/settings/api",
  }).catch(() => {});
  revalidatePath("/settings/api");
  return { message: "Key created. Copy it now: it won't be shown again.", token };
}

export async function revokeKey(fd: FormData): Promise<void> {
  const { user } = await requireUser();
  const id = String(fd.get("id") ?? "");
  const { count } = await db.apiKey.updateMany({ where: { id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (count) await logSecurityEvent("API_KEY_REVOKED", user.id, { keyId: id });
  revalidatePath("/settings/api");
}
