import Link from "next/link";
import { ArrowUpRight, Newspaper } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";
import type { BlogPostSummary } from "@/server/content";
import type { Dictionary } from "@/i18n/dictionaries/en";

export function BlogPreview({ posts, dict }: { posts: BlogPostSummary[]; dict: Dictionary }) {
  const t = dict.blog;

  if (posts.length === 0) {
    return (
      <Reveal className="glass mx-auto max-w-xl rounded-[var(--radius-card)] p-8 text-center">
        <Newspaper className="mx-auto h-10 w-10 text-subtle" />
        <p className="mt-4 text-sm text-muted">{t.emptyBody}</p>
      </Reveal>
    );
  }

  return (
    <ul className="grid gap-4 md:grid-cols-3">
      {posts.map((p, i) => (
        <Reveal as="li" key={p.slug} delay={i * 80}>
          <Link
            href={`/blog/${p.slug}`}
            className="glass group flex h-full flex-col rounded-[var(--radius-card)] p-6 transition-transform duration-300 hover:-translate-y-1"
          >
            {/* Decorative cover */}
            <div className="bg-brand relative mb-5 h-32 overflow-hidden rounded-xl opacity-80">
              <div className="bg-grid absolute inset-0 opacity-40" />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="rounded-full border border-line px-2 py-0.5">{p.category}</span>
              <span>{p.readMinutes} min</span>
            </div>
            <h3 className="mt-3 font-semibold">{p.title}</h3>
            <p className="mt-2 flex-1 text-sm text-muted">{p.excerpt}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent">
              {t.readMore}
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </Link>
        </Reveal>
      ))}
    </ul>
  );
}
