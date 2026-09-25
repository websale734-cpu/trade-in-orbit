import { cn } from "@/lib/utils";

/**
 * Branded loading animation: a breathing gradient orb with a satellite
 * circling on a tilted orbit. Pure CSS, so it renders before JS loads.
 */
export function OrbLoader({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col items-center gap-4", className)}>
      <div className="relative h-16 w-16">
        <div
          className="bg-brand absolute inset-3 rounded-full shadow-[0_0_40px_var(--glow-violet)]"
          style={{ animation: "orb-breathe 1.6s ease-in-out infinite" }}
        />
        {/* Tilted orbit */}
        <div
          className="absolute inset-0 rounded-full border border-line-strong"
          style={{ transform: "rotateX(65deg) rotateZ(-20deg)" }}
        >
          <div className="absolute inset-0" style={{ animation: "orb-spin 1.2s linear infinite" }}>
            <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-accent-cyan shadow-[0_0_12px_var(--accent-cyan)]" />
          </div>
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
