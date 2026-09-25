import "server-only";
import type { BlogPostSummary, Promotion, Testimonial } from "./content";

/**
 * DEVELOPMENT-ONLY FIXTURES
 * =========================
 * Sample content so UI states can be checked locally before the admin panel
 * exists. Enabled only when BOTH of these are true:
 *   - NODE_ENV !== "production"
 *   - DEV_FIXTURES=true in .env.local
 *
 * The testimonials below are labelled as samples ("[DEV SAMPLE]") on purpose.
 * They must never be shown on a live site: production only shows real reviews
 * approved in the admin panel.
 */
export function devFixturesEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_FIXTURES === "true";
}

export const devFixtures = {
  testimonials: [
    {
      id: "dev-1",
      authorName: "[DEV SAMPLE] Test User A",
      rating: 5,
      body: "Sample review text for layout testing only.",
      approvedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "dev-2",
      authorName: "[DEV SAMPLE] Test User B",
      rating: 4,
      body: "A second sample review, a bit longer, to check how cards handle varying text length across breakpoints.",
      approvedAt: "2026-01-02T00:00:00Z",
    },
    {
      id: "dev-3",
      authorName: "[DEV SAMPLE] Test User C",
      rating: 5,
      body: "Third sample review for the grid.",
      approvedAt: "2026-01-03T00:00:00Z",
    },
  ] satisfies Testimonial[],

  /** A promotion that always ends 3 days from now, so the countdown is visible. */
  promotion: (): Promotion => ({
    id: "dev-promo",
    message: "[DEV SAMPLE] Promotion banner: configure real promotions in the admin panel.",
    ctaLabel: "Details",
    ctaHref: "#fees",
    endsAt: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
  }),

  blogPosts: [
    {
      slug: "what-is-a-limit-order",
      title: "What is a limit order?",
      excerpt:
        "How limit orders let you set the exact price you're willing to pay, and when to use them instead of a market order.",
      category: "Trading basics",
      publishedAt: "2026-01-10T00:00:00Z",
      readMinutes: 4,
    },
    {
      slug: "how-to-secure-your-account",
      title: "Five ways to secure your crypto account",
      excerpt: "Two-factor authentication, passkeys, address books and other habits that keep your funds safe.",
      category: "Security",
      publishedAt: "2026-01-12T00:00:00Z",
      readMinutes: 5,
    },
    {
      slug: "understanding-volatility",
      title: "Understanding crypto volatility",
      excerpt: "Why crypto prices move so much, and how to think about risk before you invest.",
      category: "Learn",
      publishedAt: "2026-01-15T00:00:00Z",
      readMinutes: 6,
    },
  ] satisfies BlogPostSummary[],
};
