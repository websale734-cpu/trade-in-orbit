import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight SVG line chart with a gradient fill.
 * Colour follows the trend (first vs last point). The line "draws in" on mount
 * using a normalised pathLength so it needs no measurement.
 */
export function Sparkline({
  data,
  className,
  strokeWidth = 1.75,
  fill = true,
  animate = true,
}: {
  data: number[];
  className?: string;
  strokeWidth?: number;
  fill?: boolean;
  animate?: boolean;
}) {
  const gradientId = useId();
  if (data.length < 2) return <div className={cn("rounded-md bg-surface", className)} aria-hidden />;

  const W = 100;
  const H = 40;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * W, H - 2 - ((v - min) / range) * (H - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const up = data[data.length - 1] >= data[0];
  const color = up ? "var(--up)" : "var(--down)";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gradientId})`} className="transition-[d] duration-700" />}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        strokeDasharray={animate ? 1 : undefined}
        style={
          animate ? ({ "--path-length": 1, animation: "draw 1.4s ease-out both" } as React.CSSProperties) : undefined
        }
        className="transition-[d] duration-700"
      />
    </svg>
  );
}
