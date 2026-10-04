import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { AdminNav } from "@/components/admin/admin-nav";
import { can, requireStaff, type Permission } from "@/server/admin/rbac";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Trade In Orbit Admin" },
  robots: { index: false, follow: false },
};

const SECTIONS: { href: string; label: string; perm: Permission }[] = [
  { href: "/admin", label: "Overview", perm: "users.view" },
  { href: "/admin/users", label: "Users", perm: "users.view" },
  { href: "/admin/kyc", label: "KYC queue", perm: "kyc.review" },
  { href: "/admin/deposits", label: "Deposits", perm: "payments.review" },
  { href: "/admin/withdrawals", label: "Withdrawals", perm: "payments.review" },
  { href: "/admin/transactions", label: "Transactions", perm: "transactions.view" },
  { href: "/admin/support", label: "Support inbox", perm: "support.manage" },
  { href: "/admin/listings", label: "Listing requests", perm: "listings.view" },
  { href: "/admin/wallets", label: "Deposit wallets", perm: "settings.manage" },
  { href: "/admin/coins", label: "Coins & pairs", perm: "settings.manage" },
  { href: "/admin/settings", label: "Fees, limits & rewards", perm: "settings.manage" },
  { href: "/admin/content", label: "Content", perm: "content.manage" },
  { href: "/admin/audit", label: "Audit log", perm: "audit.view" },
];

/** Separate, staff-only admin area (role-based; 2FA required). */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const { user } = await requireStaff();
  const links = SECTIONS.filter((s) => can(user, s.perm)).map(({ href, label }) => ({ href, label }));

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="border-b border-line bg-bg-elevated md:w-60 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex h-16 items-center gap-2 px-4">
          <LogoMark />
          <span className="font-semibold">Trade In Orbit</span>
          <span className="rounded bg-down/20 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-down">ADMIN</span>
          <div className="ml-auto md:hidden">
            <ThemeToggle />
          </div>
        </div>
        <AdminNav links={links} />
        <div className="hidden space-y-2 p-4 text-xs text-muted md:block">
          <p>
            {user.name} · <span className="font-semibold text-fg">{user.role.replace("_", " ")}</span>
          </p>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <Link href="/dashboard" className="hover:text-fg">
              ← Back to app
            </Link>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
