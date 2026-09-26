import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { requireUser } from "@/server/auth/dal";
import { getDictionary } from "@/i18n/server";
import { logout } from "../(auth)/actions";

/** Shell for signed-in pages. Every page below also calls requireUser() itself. */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireUser();
  const dict = await getDictionary();
  const n = dict.app.nav;
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/dashboard" aria-label="Dashboard">
            <Logo />
          </Link>
          <nav className="ml-4 hidden items-center gap-1 sm:flex">
            <Link
              href="/dashboard"
              className="rounded-full px-3 py-2 text-sm text-muted hover:bg-surface hover:text-fg"
            >
              {n.dashboard}
            </Link>
            <Link
              href="/settings/security"
              className="rounded-full px-3 py-2 text-sm text-muted hover:bg-surface hover:text-fg"
            >
              {n.security}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/settings/security"
              aria-label={n.security}
              className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface text-muted hover:text-fg sm:hidden"
            >
              <ShieldCheck className="h-[18px] w-[18px]" />
            </Link>
            <span
              className="bg-brand grid h-10 w-10 place-items-center rounded-full text-sm font-semibold text-white"
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
