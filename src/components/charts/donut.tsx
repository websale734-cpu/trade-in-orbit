"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type DonutSegment = { key: string; label: string; value: number; color: string; display: string };

/**
 * Part-to-whole donut (≤ 6 segments; the caller folds the tail into "Other").
 *
 * Follows the dataviz rules: a 2px surface-coloured gap between segments, each
 * segment is its own hover/focus target with a tooltip, and the legend beside it
 * doubles as the table view (every value is readable without hovering).
 */
export function Donut({
  segments,
  centerLabel,
  centerValue,
  size = 200,
}: {
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: string;
  size?: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = 42;
  const stroke = 14;
  const C = 2 * Math.PI * r;
  const gap = segments.length > 1 ? (2 / size) * 100 * 0.9 : 0; // ~2px in viewBox units

  const fracs = segments.map((s) => (total > 0 ? s.value / total : 0));
  const arcs = segments.map((s, i) => {
    const frac = fracs[i];
    const start = fracs.slice(0, i).reduce((sum, f) => sum + f, 0) * C;
    const len = Math.max(0, frac * C - gap);
    return { ...s, frac, dash: `${len} ${C - len}`, offset: -start };
  });
  const focused = arcs.find((a) => a.key === active);

  return (
    <div className="relative mx-auto shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label="Portfolio breakdown">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--chart-grid)" strokeWidth={stroke} />
        {arcs.map((a) => (
          <circle
            key={a.key}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={a.color}
            strokeWidth={active === a.key ? stroke + 3 : stroke}
            strokeDasharray={a.dash}
            strokeDashoffset={a.offset}
            className={cn(
              "cursor-pointer transition-all duration-300 outline-none",
              active && active !== a.key && "opacity-40",
            )}
            tabIndex={0}
            aria-label={`${a.label}: ${a.display} (${(a.frac * 100).toFixed(1)}%)`}
            onPointerEnter={() => setActive(a.key)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(a.key)}
            onBlur={() => setActive(null)}
          />
        ))}
      </svg>
      {/* Centre readout doubles as the tooltip: value leads, label follows. */}
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
        aria-live="polite"
      >
        <span className="text-lg font-semibold">{focused ? focused.display : centerValue}</span>
        <span className="text-xs text-muted">
          {focused ? `${focused.label} · ${(focused.frac * 100).toFixed(1)}%` : centerLabel}
        </span>
      </div>
    </div>
  );
}
