import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Onboarding progress: numbered dots joined by a gradient bar. `current` is 1-based. */
export function StepProgress({ steps, current, label }: { steps: readonly string[]; current: number; label: string }) {
  const pct = ((current - 1) / (steps.length - 1)) * 100;
  return (
    <div className="mb-8" aria-label={label}>
      <div className="relative">
        <div className="absolute top-3.5 right-3.5 left-3.5 h-0.5 rounded-full bg-line-strong" />
        <div
          className="bg-brand absolute top-3.5 left-3.5 h-0.5 rounded-full transition-all duration-700"
          style={{ width: `calc((100% - 1.75rem) * ${pct / 100})` }}
        />
        <ol className="relative flex justify-between">
          {steps.map((s, i) => {
            const n = i + 1;
            const done = n < current;
            const active = n === current;
            return (
              <li key={s} className="flex flex-col items-center gap-1.5" aria-current={active ? "step" : undefined}>
                <span
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full border text-xs font-semibold transition-all duration-500",
                    done && "bg-brand border-transparent text-white",
                    active && "border-accent bg-bg text-accent shadow-[0_0_0_4px_var(--glow-violet)]",
                    !done && !active && "border-line-strong bg-bg text-subtle",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : n}
                </span>
                <span className={cn("text-[11px] font-medium", active ? "text-fg" : "text-subtle")}>{s}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
