import "server-only";
import { devFixtures, devFixturesEnabled } from "./dev-fixtures";

/**
 * Public content managed from the admin panel.
 *
 * Phase 1: there is no database yet, so these return empty results (or the
 * development-only fixtures when DEV_FIXTURES=true). From Phase 2 they read from
 * PostgreSQL via Prisma; the return types stay the same so pages don't change.
 */

export type Testimonial = {
  id: string;
  /** Display name as approved by the reviewer (e.g. "Amara O."). */
  authorName: string;
  rating: 1 | 2 | 3 | 4 | 5;
  body: string;
  approvedAt: string;
};

export type Promotion = {
  id: string;
  message: string;
  ctaLabel?: string;
  ctaHref?: string;
  endsAt: string;
};

export type BlogPostSummary = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  publishedAt: string;
  readMinutes: number;
};

/**
 * Approved testimonials only. Reviews are submitted by real, verified users and
 * must be approved by an admin before appearing here. Never seed fake reviews
 * into production.
 */
export async function getApprovedTestimonials(limit = 6): Promise<Testimonial[]> {
  if (devFixturesEnabled()) return devFixtures.testimonials.slice(0, limit);
  return [];
}

/** The currently running promotion (starts before now, ends after now), if any. */
export async function getActivePromotion(): Promise<Promotion | null> {
  if (devFixturesEnabled()) return devFixtures.promotion();
  return null;
}

export async function getLatestBlogPosts(limit = 3): Promise<BlogPostSummary[]> {
  if (devFixturesEnabled()) return devFixtures.blogPosts.slice(0, limit);
  return [];
}
