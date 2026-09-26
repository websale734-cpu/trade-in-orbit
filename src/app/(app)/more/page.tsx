import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bell,
  BellRing,
  ChevronRight,
  Gift,
  KeyRound,
  LifeBuoy,
  MessageCircle,
  Repeat,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { requireUser } from "@/server/auth/dal";

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
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">More</h1>
      {GROUPS.map((g) => (
        <section key={g.title}>
          <h2 className="mb-2 px-1 text-xs font-semibold tracking-wider text-muted uppercase">{g.title}</h2>
          <ul className="glass divide-y divide-line overflow-hidden rounded-[var(--radius-card)]">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link href={i.href} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-strong">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-strong">
                    <i.icon className="h-[18px] w-[18px] text-accent" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{i.label}</span>
                    <span className="block truncate text-xs text-muted">{i.hint}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
