import type { LucideIcon } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";

/** Grid of icon + title + body cards, used by the Features and Security sections. */
export function FeatureGrid({ items, icons }: { items: { title: string; body: string }[]; icons: LucideIcon[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, i) => {
        const Icon = icons[i % icons.length];
        return (
          <Reveal as="li" key={item.title} delay={i * 60} className="glass group rounded-[var(--radius-card)] p-6">
            <div className="relative grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface-strong">
              <div className="bg-brand absolute inset-0 rounded-xl opacity-0 blur-md transition-opacity duration-500 group-hover:opacity-40" />
              <Icon className="relative h-5 w-5 text-accent" />
            </div>
            <h3 className="mt-5 font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
          </Reveal>
        );
      })}
    </ul>
  );
}
