import { Plus } from "lucide-react";
import { Reveal } from "@/components/ui/reveal";

/** Accessible accordion built on native <details>; only one item opens at a time. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <Reveal className="mx-auto max-w-3xl space-y-3">
      {items.map((item) => (
        <details key={item.q} name="faq" className="glass group rounded-2xl px-5 open:bg-surface-strong sm:px-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium [&::-webkit-details-marker]:hidden">
            {item.q}
            <Plus className="h-5 w-5 shrink-0 text-muted transition-transform duration-300 group-open:rotate-45" />
          </summary>
          <p className="pb-5 text-sm leading-relaxed text-muted">{item.a}</p>
        </details>
      ))}
    </Reveal>
  );
}
