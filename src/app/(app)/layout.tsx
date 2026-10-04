import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { MarketProvider } from "@/components/market/market-provider";
import { AppNav, MobileTabBar } from "@/components/layout/app-nav";
import { ChatWidget } from "@/components/support/chat-widget";
import { requireUser } from "@/server/auth/dal";
import { unreadCount } from "@/server/notify/notifications";
import { getMarketSnapshot } from "@/lib/market/coingecko";
import { getDictionary } from "@/i18n/server";
import { logout } from "../(auth)/actions";

/**
 * Shell for signed-in pages: live market data for every page, top bar with
 * notifications, and a bottom tab bar on phones. Every page below also calls
 * requireUser() itself; the layout check is not the only guard.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireUser();
  const [dict, snapshot, unread] = await Promise.all([getDictionary(), getMarketSnapshot(), unreadCount(user.id)]);
  const n = dict.app.nav;
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const links = [
    { href: "/dashboard", label: n.dashboard, icon: "home" as const },
    { href: "/accounts", label: n.accounts, icon: "wallet" as const },
    { href: "/markets", label: n.markets, icon: "chart" as const },
    { href: "/trade", label: n.trade, icon: "trade" as const },
    { href: "/history", label: n.history, icon: "history" as const },
    { href: "/more", label: n.more, icon: "more" as const },
  ];
  // Phones get five tabs; Accounts lives in the More hub there.
  const mobileLinks = links
    .filter((l) => l.href !== "/accounts")
    .map((l) => (l.href === "/dashboard" ? { ...l, label: n.home } : l));

  return (
    <MarketProvider initial={snapshot}>
      <div className="flex min-h-dvh flex-col pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0">
        <header className="sticky top-0 z-40 border-b border-line bg-bg/75 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:gap-6 lg:px-8">
            <Link href="/dashboard" aria-label="Dashboard" className="shrink-0 whitespace-nowrap">
              <Logo />
            </Link>
            <AppNav links={links} />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {user.role !== "USER" && (
                <Link
                  href="/admin"
                  className="hidden rounded-full bg-down/15 px-3 py-1.5 text-xs font-bold tracking-wider text-down xl:inline-block"
                >
                  ADMIN
                </Link>
              )}
              <LanguageSwitcher className="hidden lg:block" />
              <ThemeToggle />
              <Link
                href="/notifications"
                aria-label={unread ? `${n.notifications} (${unread} unread)` : n.notifications}
                className="relative grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-muted hover:text-fg"
              >
                <Bell className="h-[18px] w-[18px]" />
                {unread > 0 && (
                  <span className="bg-brand absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs leading-none font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <span
                className="bg-brand hidden h-10 w-10 place-items-center rounded-full text-sm font-semibold text-white lg:grid"
                title={user.name}
              >
                {initials}
              </span>
              <form action={logout}>
                <button
                  type="submit"
                  aria-label={n.logout}
                  title={n.logout}
                  className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-muted hover:text-fg"
                >
                  <LogOut className="h-[18px] w-[18px]" />
                </button>
              </form>
            </div>
          </div>
        </header>
        {/* Extra bottom space below lg so the floating chat button never covers the last block. */}
        <main className="mx-auto w-full max-w-7xl min-w-0 flex-1 px-4 pt-6 pb-24 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-16">
          {children}
        </main>
        <MobileTabBar links={mobileLinks} />
        <ChatWidget />
      </div>
    </MarketProvider>
  );
}
