import "server-only";
import { connection } from "next/server";
import { db } from "./db";

/**
 * Public content managed in the admin panel (Content section).
 * Everything here is read-only for visitors; only published/approved items are returned.
 */

export type Testimonial = { id: string; authorName: string; rating: number; body: string; approvedAt: string };
export type Promotion = { id: string; message: string; ctaLabel?: string; ctaHref?: string; endsAt: string };
export type BlogPostSummary = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  publishedAt: string;
  readMinutes: number;
};

/** Approved reviews from real, signed-in customers only. */
export async function getApprovedTestimonials(limit = 6): Promise<Testimonial[]> {
  const rows = await db.testimonial.findMany({
    where: { status: "APPROVED" },
    orderBy: { reviewedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    authorName: r.displayName,
    rating: r.rating,
    body: r.body,
    approvedAt: (r.reviewedAt ?? r.createdAt).toISOString(),
  }));
}

/** The currently running promotion (active, started, not yet ended), if any. */
export async function getActivePromotion(): Promise<Promotion | null> {
  await connection(); // depends on the current time
  const now = new Date();
  const p = await db.promotion.findFirst({
    where: { active: true, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { startsAt: "desc" },
  });
  return p
    ? {
        id: p.id,
        message: p.message,
        ctaLabel: p.ctaLabel ?? undefined,
        ctaHref: p.ctaHref ?? undefined,
        endsAt: p.endsAt.toISOString(),
      }
    : null;
}

export async function getLatestBlogPosts(limit = 3): Promise<BlogPostSummary[]> {
  const rows = await db.article.findMany({
    where: { kind: "BLOG", status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
  return rows.map((a) => ({
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    category: a.category,
    publishedAt: (a.publishedAt ?? a.createdAt).toISOString(),
    readMinutes: a.readMinutes,
  }));
}

/** Published FAQ entries, or null when none exist (callers fall back to built-in copy). */
export async function getFaq(): Promise<{ q: string; a: string }[] | null> {
  const rows = await db.faqItem.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" } });
  return rows.length ? rows.map((r) => ({ q: r.question, a: r.answer })) : null;
}
