import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  BellRing,
  ChevronRight,
  Gift,
  Globe,
  KeyRound,
  LifeBuoy,
  MessageCircle,
  Repeat,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { PageHeader, PageStack, Panel } from "@/components/app/ui";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { requireUser } from "@/server/auth/dal";
import { getDictionary } from "@/i18n/server";

export const metadata: Metadata = { title: "More" };

const GROUPS = [
  {
    title: "Money",
    items: [
      { href: "/accounts", label: "Accounts", hint: "Balances and transfers", icon: Wallet },
      { href: "/deposit", label: "Deposit", hint: "Card, bank or crypto", icon: ArrowDownToLine },
      { href: "/withdraw", label: "Withdraw", hint: "To your bank or wallet", icon: ArrowUpFromLine },
    ],
  },
  {
    title: "Tools",
    items: [
      { href: "/recurring", label: "Recurring buys", hint: "Buy on a schedule", icon: Repeat },
      { href: "/alerts", label: "Price alerts", hint: "Get notified at your price", icon: BellRing },
      { href: "/rewards", label: "Rewards", hint: "Referrals and fee tiers", icon: Gift },
      { href: "/settings/api", label: "API keys", hint: "For advanced traders", icon: KeyRound },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/settings/security", label: "Security", hint: "Password, 2FA, sessions", icon: ShieldCheck },
      { href: "/notifications", label: "Notifications", hint: "Alerts and push", icon: Bell },
      { href: "/support", label: "Support", hint: "Chat and tickets", icon: MessageCircle },
      { href: "/help", label: "Help centre", hint: "FAQs and contact", icon: LifeBuoy },
    ],
  },
];

export default async function MorePage() {
  await requireUser("/more");
  const dict = await getDictionary();
  return (
    <PageStack>
      <PageHeader title="More" subtitle="Everything else in one place: money tools, settings and help." />
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
        {GROUPS.map((g) => (
          <Panel key={g.title} title={g.title} bodyClassName="-mx-3">
            <ul className="space-y-1">
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-surface-strong"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-strong">
                      <i.icon className="h-[18px] w-[18px] text-accent" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{i.label}</span>
                      <span className="block truncate text-xs text-muted sm:text-sm">{i.hint}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
        <Panel title="Preferences">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-strong">
                <Globe className="h-[18px] w-[18px] text-accent" />
              </span>
              <span className="font-medium">{dict.common.language}</span>
            </span>
            <LanguageSwitcher />
          </div>
        </Panel>
      </div>
    </PageStack>
  );
}
