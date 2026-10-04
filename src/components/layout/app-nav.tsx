"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftRight, CandlestickChart, History, Home, LayoutGrid, ShieldCheck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  home: Home,
  wallet: Wallet,
  chart: CandlestickChart,
  trade: ArrowLeftRight,
  shield: ShieldCheck,
  history: History,
  more: LayoutGrid,
};
type NavLink = { href: string; label: string; icon: keyof typeof ICONS };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop navigation in the top bar. */
export function AppNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav className="hidden min-w-0 items-center gap-1 lg:flex" aria-label="Main">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={isActive(pathname, l.href) ? "page" : undefined}
          className={cn(
            "rounded-full px-3 py-2 text-sm whitespace-nowrap transition-colors xl:px-4",
            isActive(pathname, l.href)
              ? "bg-surface-strong font-medium text-fg"
              : "text-muted hover:bg-surface hover:text-fg",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** Native-feeling bottom tab bar on phones; respects the iOS home-indicator inset. */
export function MobileTabBar({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="mx-auto flex max-w-xl justify-around px-2">
        {links.map((l) => {
          const Icon = ICONS[l.icon];
          const active = isActive(pathname, l.href);
          return (
            <li key={l.href} className="flex-1">
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors",
                  active ? "text-accent" : "text-subtle",
                )}
              >
                <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
