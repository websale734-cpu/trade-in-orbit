import { cn } from "@/lib/utils";

/**
 * Layout primitives for the signed-in area. They only use the existing theme
 * tokens (glass surface, lines, radius) so every page shares one rhythm:
 * separate cards, generous padding, and spacing that scales from phone to desktop.
 */

/** Vertical rhythm between the blocks of a page. */
export function PageStack({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("min-w-0 space-y-6 sm:space-y-8", className)}>{children}</div>;
}

/** Page title, one-line description and optional actions that wrap below on phones. */
export function PageHeader({
  title,
  subtitle,
  actions,
  badge,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
          {badge}
        </h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </header>
  );
}

/** A separated card. Pass a title (and optional action) to get a consistent header row. */
export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  as: Tag = "section",
  id,
  "aria-label": ariaLabel,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: "section" | "div" | "article" | "aside";
  id?: string;
  "aria-label"?: string;
}) {
  return (
    <Tag
      id={id}
      aria-label={ariaLabel}
      className={cn("glass min-w-0 rounded-[var(--radius-card)] p-5 sm:p-6", className)}
    >
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2 sm:mb-5">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold sm:text-lg">{title}</h2>}
            {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn("min-w-0", bodyClassName)}>{children}</div>
    </Tag>
  );
}

/** Summary figure in its own box: label, value and an optional hint line. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
  valueClassName,
  action,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  valueClassName?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("glass flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] p-5 sm:p-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm leading-snug font-medium text-muted">
          {icon && (
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-violet/15 text-accent ring-1 ring-accent-violet/25">
              {icon}
            </span>
          )}
          <span className="min-w-0">{label}</span>
        </span>
        {action}
      </div>
      <div
        className={cn("tabular min-w-0 text-2xl font-semibold tracking-tight break-words sm:text-3xl", valueClassName)}
      >
        {value}
      </div>
      {hint && <div className="text-sm text-muted">{hint}</div>}
    </div>
  );
}

/** Friendly empty state inside a panel. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  body?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-5 py-10 text-center">
      {icon && (
        <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-strong text-muted">{icon}</span>
      )}
      <p className="font-medium">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

/** Small pill used for segmented tabs (Real/Demo, Transactions/Statements). */
export const segmentedWrap =
  "inline-flex max-w-full rounded-full border border-line bg-surface p-1 text-sm font-semibold";
export const segmentedItem = "rounded-full px-4 py-2 whitespace-nowrap transition-colors";
