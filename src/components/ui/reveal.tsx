"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Fades and lifts its children into view the first time they scroll on screen.
 * Content is visible by default if JS or IntersectionObserver is unavailable.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "li";
}) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"idle" | "hidden" | "shown">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // Only hide elements that start below the fold, so nothing above it flickers.
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setState("hidden");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState("shown");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement & HTMLLIElement>}
      className={cn(
        "transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        state === "hidden" && "translate-y-4 opacity-0",
        state === "shown" && "translate-y-0 opacity-100",
        className,
      )}
      style={{ transitionDelay: state === "shown" ? `${delay}ms` : undefined }}
    >
      {children}
    </Tag>
  );
}
