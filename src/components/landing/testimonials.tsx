import { BadgeCheck, MessageSquareQuote, Star } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import type { Testimonial } from "@/server/content";
import type { Dictionary } from "@/i18n/dictionaries/en";

/**
 * Shows admin-approved reviews from real customers. With none approved yet it
 * shows an honest empty state. Never fill this with invented reviews.
 */
export function Testimonials({ items, dict }: { items: Testimonial[]; dict: Dictionary }) {
  const t = dict.testimonials;

  if (items.length === 0) {
    return (
      <Reveal className="glass mx-auto max-w-xl rounded-[var(--radius-card)] p-8 text-center">
        <MessageSquareQuote className="mx-auto h-10 w-10 text-subtle" />
        <h3 className="mt-4 font-semibold">{t.emptyTitle}</h3>
        <p className="mt-2 text-sm text-muted">{t.emptyBody}</p>
      </Reveal>
    );
  }

  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {items.map((r, i) => (
        <Reveal as="li" key={r.id} delay={i * 80} className="glass flex flex-col rounded-[var(--radius-card)] p-6">
          <div className="flex gap-0.5" aria-label={`${r.rating} out of 5`}>
            {Array.from({ length: 5 }, (_, s) => (
              <Star key={s} className={s < r.rating ? "h-4 w-4 fill-warn text-warn" : "h-4 w-4 text-line-strong"} />
            ))}
          </div>
          <blockquote className="mt-4 flex-1 text-sm leading-relaxed">“{r.body}”</blockquote>
          <div className="mt-5 flex items-center gap-2 text-sm">
            <span className="font-semibold">{r.authorName}</span>
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <BadgeCheck className="h-3.5 w-3.5 text-accent-cyan" />
              {t.verified}
            </span>
          </div>
        </Reveal>
      ))}
    </ul>
  );
}
