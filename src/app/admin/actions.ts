"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { assertPermission, audit, ForbiddenError } from "@/server/admin/rbac";
import { reviewKyc } from "@/server/admin/kyc";
import { adjustBalance, correctAdjustment, LedgerError } from "@/server/ledger";
import { revokeAllSessions } from "@/server/auth/session";
import { completeDeposit, failDeposit } from "@/server/funding";
import { advanceWithdrawal, rejectWithdrawal } from "@/server/withdrawals";
import { saveSetting, settingsSchemas, type SettingsKey } from "@/server/settings";
import { notify } from "@/server/notify/notifications";
import type { FormState } from "@/components/ui/form";

/**
 * Admin Server Actions. Each one: (1) checks the caller's permission
 * server-side, (2) performs the change, (3) writes the audit log.
 */

function failure(err: unknown): FormState {
  if (err instanceof ForbiddenError) return { error: "You don't have permission to do that." };
  if (err instanceof LedgerError) return { error: err.message };
  if (err instanceof Error && err.message.startsWith("You can't")) return { error: err.message };
  console.error("[admin]", err);
  return { error: "Something went wrong. Nothing was changed." };
}

const reason = z.string().trim().min(5, "Give a reason (at least 5 characters).").max(500);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function setUserStatus(_p: FormState | undefined, fd: FormData): Promise<FormState> {
  try {
    const admin = await assertPermission("users.suspend");
    const userId = String(fd.get("userId"));
    const status = fd.get("status") === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
    const why = reason.safeParse(fd.get("reason"));
    if (!why.success) return { error: why.error.issues[0].message };
    if (userId === admin.id) return { error: "You can't suspend yourself." };
    await db.user.update({ where: { id: userId }, data: { status } });
    if (status === "SUSPENDED") await revokeAllSessions(userId);
    await audit(
      admin,
      status === "SUSPENDED" ? "user.suspend" : "user.unsuspend",
      { type: "user", id: userId },
      { reason: why.data },
    );
    revalidatePath(`/admin/users/${userId}`);
    return { message: status === "SUSPENDED" ? "User suspended and signed out everywhere." : "User reactivated." };
  } catch (err) {
    return failure(err);
  }
}

export async function setUserRole(_p: FormState | undefined, fd: FormData): Promise<FormState> {
  try {
    const admin = await assertPermission("roles.manage");
    const userId = String(fd.get("userId"));
    const role = z.enum(["USER", "SUPPORT", "COMPLIANCE", "ADMIN", "SUPER_ADMIN"]).parse(fd.get("role"));
    if (userId === admin.id) return { error: "You can't change your own role." };
    const before = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
    await db.user.update({ where: { id: userId }, data: { role } });
    await audit(admin, "user.role", { type: "user", id: userId }, { from: before.role, to: role });
    revalidatePath(`/admin/users/${userId}`);
    return { message: `Role changed to ${role}.` };
  } catch (err) {
    return failure(err);
  }
}

/**
 * Audit details for a posted adjustment: who, how much of which coin, and why.
 * Private to staff (the admin audit log is never shown to customers).
 */
async function adjustmentAudit(
  admin: { name: string },
  entry: { id: string; userId: string | null; description: string; reason: string | null; metadata: unknown },
) {
  const meta = entry.metadata as { accountId: string; customerLabel?: string };
  const leg = await db.posting.findFirst({
    where: { entryId: entry.id, ledgerAccount: { accountId: meta.accountId } },
    select: { amount: true, assetCode: true },
  });
  return {
    adminName: admin.name,
    userId: entry.userId,
    accountId: meta.accountId,
    assetCode: leg?.assetCode ?? "",
    amount: leg?.amount.toString() ?? "",
    label: meta.customerLabel ?? "",
    description: entry.description,
    reason: entry.reason ?? "",
  };
}

export async function adjustUserBalance(_p: FormState | undefined, fd: FormData): Promise<FormState> {
  try {
    const admin = await assertPermission("ledger.adjust");
    const accountId = String(fd.get("accountId"));
    const why = reason.safeParse(fd.get("reason"));
    if (!why.success) return { error: "Give an internal reason (at least 5 characters)." };
    const entry = await adjustBalance({
      actorId: admin.id,
      accountId,
      assetCode: String(fd.get("assetCode")),
      amount: String(fd.get("amount")),
      description: String(fd.get("description") ?? ""),
      label: String(fd.get("label") ?? ""),
      reason: why.data,
    });
    await audit(admin, "ledger.adjust", { type: "journal_entry", id: entry!.id }, await adjustmentAudit(admin, entry!));
    revalidatePath(`/admin/users/${String(fd.get("userId"))}`);
    return { message: "Adjustment posted to the ledger." };
  } catch (err) {
    return failure(err);
  }
}

export async function correctUserAdjustment(_p: FormState | undefined, fd: FormData): Promise<FormState> {
  try {
    const admin = await assertPermission("ledger.adjust");
    const entryId = String(fd.get("entryId"));
    const why = reason.safeParse(fd.get("reason"));
    if (!why.success) return { error: "Give an internal reason (at least 5 characters)." };
    const entry = await correctAdjustment({
      actorId: admin.id,
      entryId,
      description: String(fd.get("description") ?? ""),
      reason: why.data,
    });
    await audit(
      admin,
      "ledger.correct",
      { type: "journal_entry", id: entry!.id },
      {
        ...(await adjustmentAudit(admin, entry!)),
        correctsEntryId: entryId,
      },
    );
    revalidatePath(`/admin/users/${String(fd.get("userId"))}`);
    return { message: "Correcting entry posted. The original stays in the history." };
  } catch (err) {
    return failure(err);
  }
}

// ---------------------------------------------------------------------------
// KYC
// ---------------------------------------------------------------------------

export async function decideKyc(_p: FormState | undefined, fd: FormData): Promise<FormState> {
  try {
    const admin = await assertPermission("kyc.review");
    const id = String(fd.get("submissionId"));
    const decision = fd.get("decision") === "APPROVED" ? "APPROVED" : "REJECTED";
    let why: string | undefined;
    if (decision === "REJECTED") {
      const r = reason.safeParse(fd.get("reason"));
      if (!r.success) return { error: "A rejection needs a reason the customer will see." };
      why = r.data;
    }
    const sub = await reviewKyc(id, admin.id, decision, why);
    if (!sub) return { error: "This submission was already reviewed." };
    await audit(
      admin,
      `kyc.${decision.toLowerCase()}`,
      { type: "kyc_submission", id },
      { userId: sub.userId, reason: why },
    );
    revalidatePath("/admin/kyc");
    revalidatePath(`/admin/users/${sub.userId}`);
    return {
      message:
        decision === "APPROVED"
          ? "Approved. The customer has been notified."
          : "Rejected. The customer has been notified.",
    };
  } catch (err) {
    return failure(err);
  }
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function decideDeposit(_p: FormState | undefined, fd: FormData): Promise<FormState> {
  try {
    const admin = await assertPermission("payments.review");
    const id = String(fd.get("depositId"));
    if (fd.get("decision") === "confirm") {
      const d = await completeDeposit(id, String(fd.get("providerRef") || "") || undefined);
      if (!d) return { error: "This deposit is no longer pending." };
      await audit(
        admin,
        "deposit.confirm",
        { type: "deposit", id },
        { providerRef: String(fd.get("providerRef") || "") },
      );
    } else {
      const r = reason.safeParse(fd.get("reason"));
      if (!r.success) return { error: r.error.issues[0].message };
      if (!(await failDeposit(id, r.data))) return { error: "This deposit is no longer pending." };
      await audit(admin, "deposit.fail", { type: "deposit", id }, { reason: r.data });
    }
    revalidatePath("/admin/deposits");
    return { message: "Deposit updated." };
  } catch (err) {
    return failure(err);
  }
}

export async function decideWithdrawal(_p: FormState | undefined, fd: FormData): Promise<FormState> {
  try {
    const admin = await assertPermission("payments.review");
    const id = String(fd.get("withdrawalId"));
    if (fd.get("decision") === "reject") {
      const r = reason.safeParse(fd.get("reason"));
      if (!r.success) return { error: r.error.issues[0].message };
      await rejectWithdrawal(id, r.data);
      await audit(admin, "withdrawal.reject", { type: "withdrawal", id }, { reason: r.data });
    } else {
      const w = await db.withdrawal.findUnique({ where: { id } });
      if (w?.userId === admin.id) return { error: "You can't approve your own withdrawal." };
      const txRef = String(fd.get("txRef") || "").trim() || undefined;
      if (w?.status === "APPROVED" && !txRef)
        return { error: "Enter the payout / transaction reference to mark it sent." };
      const next = await advanceWithdrawal(id, txRef);
      if (!next) return { error: "This withdrawal can't be advanced." };
      await audit(admin, `withdrawal.${next.status.toLowerCase()}`, { type: "withdrawal", id }, { txRef });
    }
    revalidatePath("/admin/withdrawals");
    return { message: "Withdrawal updated." };
  } catch (err) {
    return failure(err);
  }
}

// ---------------------------------------------------------------------------
// Settings & coins
// ---------------------------------------------------------------------------

export async function updateSettings(_p: FormState | undefined, fd: FormData): Promise<FormState> {
  try {
    const admin = await assertPermission("settings.manage");
    const key = String(fd.get("key")) as SettingsKey;
    if (!(key in settingsSchemas)) return { error: "Unknown settings section." };
    let value: unknown;
    try {
      value = JSON.parse(String(fd.get("value") ?? ""));
    } catch {
      return { error: "That isn't valid JSON." };
    }
    const err = await saveSetting(key, value, admin.id);
    if (err) return { error: err };
    await audit(admin, `settings.${key}`, { type: "setting", id: key }, value as object);
    revalidatePath("/admin/settings");
    revalidatePath("/", "layout");
    return { message: `${key} saved. Changes apply within 15 seconds.` };
  } catch (err) {
    return failure(err);
  }
}

export async function toggleAsset(fd: FormData): Promise<void> {
  const admin = await assertPermission("settings.manage");
  const code = String(fd.get("code"));
  const field = fd.get("field") === "tradingEnabled" ? "tradingEnabled" : "enabled";
  if (code === "USD" && field === "enabled") return; // the settlement currency can't be disabled
  const asset = await db.asset.findUniqueOrThrow({ where: { code } });
  const value = !asset[field];
  await db.asset.update({ where: { code }, data: { [field]: value } });
  await audit(admin, `asset.${field}`, { type: "asset", id: code }, { value });
  revalidatePath("/admin/coins");
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const promoSchema = z.object({
  message: z.string().trim().min(5).max(160),
  ctaLabel: z.string().trim().max(30).optional(),
  ctaHref: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !v || v.startsWith("/") || v.startsWith("https://"), "Links must start with / or https://")
    .optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});

export async function createPromotion(_p: FormState | undefined, fd: FormData): Promise<FormState> {
  try {
    const admin = await assertPermission("content.manage");
    const parsed = promoSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    if (parsed.data.endsAt <= parsed.data.startsAt) return { error: "The end must be after the start." };
    const p = await db.promotion.create({
      data: { ...parsed.data, ctaLabel: parsed.data.ctaLabel || null, ctaHref: parsed.data.ctaHref || null },
    });
    await audit(admin, "promotion.create", { type: "promotion", id: p.id }, { message: p.message });
    revalidatePath("/admin/content");
    revalidatePath("/", "layout");
    return { message: "Promotion created." };
  } catch (err) {
    return failure(err);
  }
}

export async function togglePromotion(fd: FormData): Promise<void> {
  const admin = await assertPermission("content.manage");
  const id = String(fd.get("id"));
  const p = await db.promotion.findUniqueOrThrow({ where: { id } });
  await db.promotion.update({ where: { id }, data: { active: !p.active } });
  await audit(admin, p.active ? "promotion.deactivate" : "promotion.activate", { type: "promotion", id });
  revalidatePath("/admin/content");
  revalidatePath("/", "layout");
}

const articleSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["BLOG", "ACADEMY"]),
  title: z.string().trim().min(3).max(140),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug: lower-case letters, numbers and dashes."),
  excerpt: z.string().trim().min(10).max(300),
  body: z.string().trim().min(20).max(50_000),
  category: z.string().trim().min(2).max(40),
  level: z.string().trim().max(20).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]),
});

export async function saveArticle(_p: FormState | undefined, fd: FormData): Promise<FormState> {
  try {
    const admin = await assertPermission("content.manage");
    const parsed = articleSchema.safeParse(Object.fromEntries(fd));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const { id, ...data } = parsed.data;
    const readMinutes = Math.max(1, Math.round(data.body.split(/\s+/).length / 220));
    const existing = id ? await db.article.findUnique({ where: { id } }) : null;
    const publishedAt = data.status === "PUBLISHED" ? (existing?.publishedAt ?? new Date()) : null;
    const saved = existing
      ? await db.article.update({
          where: { id: existing.id },
          data: { ...data, level: data.level || null, readMinutes, publishedAt },
        })
      : await db.article.create({ data: { ...data, level: data.level || null, readMinutes, publishedAt } });
    await audit(
      admin,
      existing ? "article.update" : "article.create",
      { type: "article", id: saved.id },
      { title: saved.title, status: saved.status },
    );
    revalidatePath("/admin/content");
    revalidatePath("/", "layout");
    return { message: `"${saved.title}" saved as ${saved.status.toLowerCase()}.` };
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint"))
      return { error: "That slug is already used." };
    return failure(err);
  }
}

export async function saveFaq(_p: FormState | undefined, fd: FormData): Promise<FormState> {
  try {
    const admin = await assertPermission("content.manage");
    const parsed = z
      .object({
        question: z.string().trim().min(5).max(200),
        answer: z.string().trim().min(5).max(2000),
        sortOrder: z.coerce.number().int().min(0).max(999),
      })
      .safeParse(Object.fromEntries(fd));
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const f = await db.faqItem.create({ data: parsed.data });
    await audit(admin, "faq.create", { type: "faq", id: f.id }, { question: f.question });
    revalidatePath("/admin/content");
    revalidatePath("/", "layout");
    return { message: "FAQ added." };
  } catch (err) {
    return failure(err);
  }
}

export async function deleteFaq(fd: FormData): Promise<void> {
  const admin = await assertPermission("content.manage");
  const id = String(fd.get("id"));
  await db.faqItem.delete({ where: { id } });
  await audit(admin, "faq.delete", { type: "faq", id });
  revalidatePath("/admin/content");
  revalidatePath("/", "layout");
}

export async function moderateTestimonial(fd: FormData): Promise<void> {
  const admin = await assertPermission("content.manage");
  const id = String(fd.get("id"));
  const status = fd.get("decision") === "APPROVED" ? "APPROVED" : "REJECTED";
  const t = await db.testimonial.update({ where: { id }, data: { status, reviewedAt: new Date() } });
  await audit(admin, `testimonial.${status.toLowerCase()}`, { type: "testimonial", id });
  if (status === "APPROVED")
    await notify(t.userId, {
      type: "SYSTEM",
      title: "Your review is live",
      body: "Thanks for sharing your experience with Trade In Orbit.",
      link: "/",
    }).catch(() => {});
  revalidatePath("/admin/content");
  revalidatePath("/", "layout");
}
