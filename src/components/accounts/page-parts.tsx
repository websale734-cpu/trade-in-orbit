import Link from "next/link";
import { ArrowDownToLine, ArrowLeft, ArrowLeftRight, ArrowUpFromLine, DollarSign, RefreshCw } from "lucide-react";
import { CoinIcon } from "@/components/market/coin-icon";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { cn } from "@/lib/utils";

/** Keyboard focus ring shared by the accounts pages' card links. */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

/** Page title with one plain-language sentence about what the page is for, and an optional way back. */
export function PageIntro({
  title,
  intro,
  back,
  icon,
  children,
}: {
  title: React.ReactNode;
  intro?: React.ReactNode;
  back?: { href: string; label: string };
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="space-y-3">
      {back && (
        <Link
          href={back.href}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full text-sm text-muted transition-colors hover:text-fg",
            focusRing,
          )}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {back.label}
        </Link>
      )}
      <h1 className="flex min-w-0 items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        {icon}
        {title}
      </h1>
      {intro && <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">{intro}</p>}
      {children}
    </header>
  );
}

/**
 * The four money actions, each its own page. Optional context (an account, a
 * coin) pre-selects them on Convert and Transfer.
 */
export function MoneyActions({
  labels,
  context = {},
  compact = false,
}: {
  labels: Dictionary["app"]["accounts"]["actions"];
  context?: { account?: string; asset?: string };
  /** Always two columns, for when the actions sit in a narrow side column. */
  compact?: boolean;
}) {
  const query = (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
    return qs ? `?${qs}` : "";
  };
  const items = [
    { href: "/deposit", label: labels.deposit, hint: labels.depositHint, Icon: ArrowDownToLine },
    {
      href: `/convert${query({ account: context.account, from: context.asset })}`,
      label: labels.convert,
      hint: labels.convertHint,
      Icon: RefreshCw,
    },
    {
      href: `/transfer${query({ from: context.account, asset: context.asset })}`,
      label: labels.transfer,
      hint: labels.transferHint,
      Icon: ArrowLeftRight,
    },
    { href: "/withdraw", label: labels.withdraw, hint: labels.withdrawHint, Icon: ArrowUpFromLine },
  ];
  return (
    <nav aria-label="Money actions" className={cn("grid grid-cols-2 gap-3 sm:gap-4", !compact && "sm:grid-cols-4")}>
      {items.map(({ href, label, hint, Icon }) => (
        <Link
          key={label}
          href={href}
          className={cn(
            "glass group flex min-w-0 flex-col items-start gap-3 rounded-2xl p-4 transition-colors hover:bg-surface-strong sm:p-5",
            focusRing,
          )}
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-violet/15 text-accent ring-1 ring-accent-violet/25 transition-colors group-hover:bg-accent-violet/25">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold">{label}</span>
            <span className="mt-0.5 block text-xs leading-snug text-muted">{hint}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** Coin logo, with a dollar sign for the USD cash balance. */
export function AssetIcon({ code, src, size = 40 }: { code: string; src: string | null; size?: number }) {
  if (code === "USD")
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full bg-up/15 text-up ring-1 ring-up/25"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <DollarSign style={{ width: size * 0.5, height: size * 0.5 }} />
      </span>
    );
  return <CoinIcon src={src} symbol={code} size={size} />;
}

/** Calm placeholder shown while an accounts page loads. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl animate-pulse space-y-10" role="status">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3">
        <div className="h-4 w-24 rounded-full bg-surface-strong" />
        <div className="h-9 w-56 rounded-xl bg-surface-strong" />
        <div className="h-4 w-80 max-w-full rounded-full bg-surface" />
      </div>
      <div className="h-44 rounded-[var(--radius-card)] bg-surface" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-2xl bg-surface" />
        ))}
      </div>
      <div className="h-24 rounded-[var(--radius-card)] bg-surface" />
    </div>
  );
}
