import type { Metadata } from "next";
import { Award, Gift, MousePointerClick, UserPlus, BadgeCheck } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { affiliateStats, loyaltyStatus } from "@/server/rewards";
import { getSettings } from "@/server/settings";
import { siteConfig } from "@/config/site";
import { PageHeader, PageStack, Panel, StatCard } from "@/components/app/ui";
import { cn, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Rewards" };

export default async function RewardsPage() {
  const { user } = await requireUser("/rewards");
  const [stats, loyalty, settings] = await Promise.all([
    affiliateStats(user.id),
    loyaltyStatus(user.id),
    getSettings(),
  ]);
  const { referral } = settings.rewards;
  const link = `${siteConfig.url}/r/${stats.code}`;
  const progress = loyalty.next
    ? Math.min(
        100,
        ((loyalty.volume - loyalty.current.minVolumeUsd) / (loyalty.next.minVolumeUsd - loyalty.current.minVolumeUsd)) *
          100,
      )
    : 100;

  return (
    <PageStack>
      <PageHeader title="Rewards" subtitle="Invite friends and lower your trading fees as you trade more." />

      <div className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-4">
        {[
          { icon: MousePointerClick, label: "Link clicks", value: stats.clicks.toLocaleString("en-US") },
          { icon: UserPlus, label: "Sign-ups", value: stats.signups.toLocaleString("en-US") },
          { icon: BadgeCheck, label: "Qualified", value: stats.qualified.toLocaleString("en-US") },
          { icon: Award, label: "Earned", value: formatMoney(stats.earningsUsd) },
        ].map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={<s.icon className="h-4 w-4" />} />
        ))}
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-accent" /> Refer a friend
            </span>
          }
          description={
            <>
              When someone signs up with your link and their deposits reach {formatMoney(referral.minDepositUsd)}, you
              get <strong className="text-fg">{formatMoney(referral.referrerBonusUsd)}</strong>
              {referral.refereeBonusUsd > 0 && (
                <>
                  {" "}
                  and they get <strong className="text-fg">{formatMoney(referral.refereeBonusUsd)}</strong>
                </>
              )}
              , paid once per friend in USD to your main account.
            </>
          }
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <code
              className="tabular min-w-0 flex-1 truncate rounded-xl border border-line bg-surface-strong px-4 py-3 text-sm"
              data-testid="referral-link"
            >
              {link}
            </code>
            <CopyButton value={link} label="Copy link" />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-subtle">
            Your code: <span className="font-mono font-semibold text-muted">{stats.code}</span>. Bonus amounts are set
            by Trade In Orbit and may change; self-referrals and duplicate accounts don&apos;t qualify.
          </p>

          {stats.referred.length > 0 && (
            <ul className="mt-5 divide-y divide-line border-t border-line text-sm">
              {stats.referred.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-3.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className="block text-xs text-muted">
                      Joined <LocalTime date={r.joinedAt} />
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
                      r.rewarded ? "bg-up/10 text-up" : "bg-surface-strong text-muted",
                    )}
                  >
                    {r.rewarded ? "Bonus paid" : r.verified ? "Awaiting deposit" : "Awaiting verification"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-2">
              <Award className="h-4 w-4 text-accent" /> Loyalty tier
            </span>
          }
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-semibold" data-testid="loyalty-tier">
                {loyalty.current.name}
              </p>
              <p className="mt-1 text-sm text-muted">
                {loyalty.current.feeDiscountPct > 0
                  ? `${loyalty.current.feeDiscountPct}% off trading fees`
                  : "Standard trading fees"}
              </p>
            </div>
            <p className="tabular text-sm text-muted">30-day volume: {formatMoney(loyalty.volume)}</p>
          </div>
          <div
            className="mt-5 h-2 overflow-hidden rounded-full bg-surface-strong"
            role="progressbar"
            aria-valuenow={Math.round(progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progress to next tier"
          >
            <div className="bg-brand h-full rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 text-sm text-muted">
            {loyalty.next
              ? `Trade ${formatMoney(loyalty.next.minVolumeUsd - loyalty.volume)} more in 30 days to reach ${loyalty.next.name}.`
              : "You're in the top tier."}
          </p>

          <div className="mt-6 text-sm">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_5.5rem] gap-x-4 px-3 pb-2 text-xs font-medium text-muted">
              <span>Tier</span>
              <span>30-day volume</span>
              <span className="text-right">Discount</span>
            </div>
            <ul className="space-y-1">
              {loyalty.tiers.map((t) => {
                const current = t.name === loyalty.current.name;
                return (
                  <li
                    key={t.name}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_auto_5.5rem] items-center gap-x-4 rounded-xl px-3 py-3",
                      current
                        ? "bg-surface-strong font-semibold ring-1 ring-accent-violet/30"
                        : "border-b border-line last:border-0",
                    )}
                    aria-current={current ? "true" : undefined}
                  >
                    <span className="truncate">{t.name}</span>
                    <span className="tabular text-muted">{formatMoney(t.minVolumeUsd)}+</span>
                    <span className="tabular text-right">{t.feeDiscountPct}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-subtle">
            Volume counts filled real-money trades (not demo). Tiers are recalculated continuously.
          </p>
        </Panel>
      </div>
    </PageStack>
  );
}
