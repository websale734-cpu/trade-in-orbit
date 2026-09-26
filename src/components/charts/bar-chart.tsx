"use client";

import { useState } from "react";

/**
 * Single-series daily bar chart (magnitude over time, one colour).
 * Each bar's hover/focus target is its full column, wider than the painted
 * mark; a visually hidden table carries every value for assistive tech.
 */
export function BarChart({
  data,
  label,
  unit,
  height = 160,
}: {
  data: { day: string; value: number }[];
  label: string;
  /** How values are formatted (a plain string, so it can come from a Server Component). */
  unit: "usd" | "count";
  height?: number;
}) {
  const format = (v: number) =>
    unit === "usd"
      ? v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: v >= 1000 ? 0 : 2 })
      : v.toLocaleString("en-US");
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const n = data.length;
  const colW = 100 / n;
  const barW = colW * 0.6;
  const shown = active !== null ? data[active] : null;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <figure>
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-muted">{label}</span>
        <span className="text-right text-sm">
          <strong className="font-semibold">{format(shown ? shown.value : total)}</strong>{" "}
          <span className="text-xs text-muted">{shown ? shown.day : "last 30 days"}</span>
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="mt-3 w-full"
        style={{ height }}
        role="img"
        aria-label={`${label}, last 30 days`}
      >
        <line
          x1="0"
          x2="100"
          y1={height - 0.5}
          y2={height - 0.5}
          stroke="var(--line-strong)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 8);
          const x = i * colW + (colW - barW) / 2;
          return (
            <g key={d.day}>
              {h > 0 && (
                <path
                  d={`M${x},${height} V${height - h + 2} Q${x},${height - h} ${x + 1},${height - h} H${x + barW - 1} Q${x + barW},${height - h} ${x + barW},${height - h + 2} V${height} Z`}
                  fill="var(--series-1)"
                  opacity={active === null || active === i ? 1 : 0.45}
                />
              )}
              {/* Full-column hit target */}
              <rect
                x={i * colW}
                y={0}
                width={colW}
                height={height}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.day}: ${format(d.value)}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="outline-none"
              />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-subtle">
        <span>{data[0]?.day}</span>
        <span>{data[n - 1]?.day}</span>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
