import type { Metadata } from "next";
import { Award, Gift, MousePointerClick, UserPlus, BadgeCheck } from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { affiliateStats, loyaltyStatus } from "@/server/rewards";
import { getSettings } from "@/server/settings";
import { siteConfig } from "@/config/site";
import { cn, formatMoney } from "@/lib/utils";

export const metadata: Metadata = { title: "Rewards" };

export default async function RewardsPage() {
  const { user } = await requireUser("/rewards");
  const [stats, loyalty, settings] = await Promise.all([affiliateStats(user.id), loyaltyStatus(user.id), getSettings()]);
  const { referral } = settings.rewards;
  const link = `${siteConfig.url}/r/${stats.code}`;
  const progress = loyalty.next
    ? Math.min(
        100,
        ((loyalty.volume - loyalty.current.minVolumeUsd) / (loyalty.next.minVolumeUsd - loyalty.current.minVolumeUsd)) * 100,
      )
    : 100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Rewards</h1>
        <p className="mt-1 text-sm text-muted">Invite friends and lower your trading fees as you trade more.</p>
      </div>

      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Gift className="h-4 w-4 text-accent" /> Refer a friend
        </h2>
        <p className="mt-2 text-sm text-muted">
          When someone signs up with your link and their deposits reach {formatMoney(referral.minDepositUsd)}, you get{" "}
          <strong className="text-fg">{formatMoney(referral.referrerBonusUsd)}</strong>
          {referral.refereeBonusUsd > 0 && (
            <>
              {" "}
              and they get <strong className="text-fg">{formatMoney(referral.refereeBonusUsd)}</strong>
            </>
          )}
          , paid once per friend in USD to your main account.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="tabular min-w-0 flex-1 truncate rounded-xl border border-line bg-surface-strong px-4 py-3 text-sm" data-testid="referral-link">
            {link}
          </code>
          <CopyButton value={link} label="Copy link" />
        </div>
        <p className="mt-2 text-xs text-subtle">
          Your code: <span className="font-mono font-semibold text-muted">{stats.code}</span>. Bonus amounts are set by
          Orbtrade and may change; self-referrals and duplicate accounts don&apos;t qualify.
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: MousePointerClick, label: "Link clicks", value: stats.clicks.toLocaleString("en-US") },
            { icon: UserPlus, label: "Sign-ups", value: stats.signups.toLocaleString("en-US") },
            { icon: BadgeCheck, label: "Qualified", value: stats.qualified.toLocaleString("en-US") },
            { icon: Award, label: "Earned", value: formatMoney(stats.earningsUsd) },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-line bg-surface p-4">
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <s.icon className="h-3.5 w-3.5" /> {s.label}
              </dt>
              <dd className="tabular mt-1 text-xl font-semibold">{s.value}</dd>
            </div>
          ))}
        </dl>

        {stats.referred.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 font-medium">Friend</th>
                  <th className="py-2 font-medium">Joined</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {stats.referred.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2.5">{r.name}</td>
                    <td className="py-2.5 text-muted">
                      <LocalTime date={r.joinedAt} />
                    </td>
                    <td className="py-2.5">
                      {r.rewarded ? (
                        <span className="text-up">Bonus paid</span>
                      ) : (
                        <span className="text-muted">{r.verified ? "Awaiting deposit" : "Awaiting verification"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <Award className="h-4 w-4 text-accent" /> Loyalty tier
        </h2>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-semibold" data-testid="loyalty-tier">
              {loyalty.current.name}
            </p>
            <p className="text-sm text-muted">
              {loyalty.current.feeDiscountPct > 0
                ? `${loyalty.current.feeDiscountPct}% off trading fees`
                : "Standard trading fees"}
            </p>
          </div>
          <p className="tabular text-sm text-muted">30-day volume: {formatMoney(loyalty.volume)}</p>
        </div>
        <div
          className="mt-4 h-2 overflow-hidden rounded-full bg-surface-strong"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progress to next tier"
        >
          <div className="bg-brand h-full rounded-full" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted">
          {loyalty.next
            ? `Trade ${formatMoney(loyalty.next.minVolumeUsd - loyalty.volume)} more in 30 days to reach ${loyalty.next.name}.`
            : "You're in the top tier."}
        </p>

        <table className="mt-5 w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-2 font-medium">Tier</th>
              <th className="py-2 font-medium">30-day volume</th>
              <th className="py-2 text-right font-medium">Fee discount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loyalty.tiers.map((t) => (
              <tr key={t.name} className={cn(t.name === loyalty.current.name && "font-semibold")}>
                <td className="py-2.5">{t.name}</td>
                <td className="tabular py-2.5 text-muted">{formatMoney(t.minVolumeUsd)}+</td>
                <td className="tabular py-2.5 text-right">{t.feeDiscountPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-subtle">
          Volume counts filled real-money trades (not demo). Tiers are recalculated continuously.
        </p>
      </section>
    </div>
  );
}
