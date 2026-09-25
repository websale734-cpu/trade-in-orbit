import { useId } from "react";
import { cn } from "@/lib/utils";

/** Orbtrade mark: a gradient orb crossed by a tilted orbit ring. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--accent-violet)" />
          <stop offset="1" stopColor="var(--accent-cyan)" />
        </linearGradient>
        <radialGradient id={`${id}-h`} cx="12" cy="11" r="10" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="9" fill={`url(#${id}-g)`} />
      <circle cx="16" cy="16" r="9" fill={`url(#${id}-h)`} />
      <ellipse
        cx="16"
        cy="16"
        rx="14.5"
        ry="5.2"
        transform="rotate(-24 16 16)"
        fill="none"
        stroke={`url(#${id}-g)`}
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight">Orbtrade</span>
    </span>
  );
}
