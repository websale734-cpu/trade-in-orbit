import type { Metadata } from "next";
import QRCode from "qrcode";
import { PageIntro } from "@/components/accounts/page-parts";
import { KycGate, SandboxBadge } from "@/components/app/kyc-gate";
import { StatusBadge } from "@/components/app/status-badge";
import { getDictionary } from "@/i18n/server";
import { LocalTime } from "@/components/ui/local-time";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { cryptoMode, depositOutcome } from "@/server/funding";
import { depositWalletList } from "@/server/wallets";
import { formatQty } from "@/lib/assets";
import { DepositForm, type DepositCoin } from "./deposit-form";

export const metadata: Metadata = { title: "Deposit" };

export default async function DepositPage() {
  const { user } = await requireUser("/deposit");
  const t = (await getDictionary()).app.accounts;
  const intro = { title: t.actions.deposit, intro: t.depositIntro, back: { href: "/accounts", label: t.allAccounts } };
  if (user.kycStatus !== "APPROVED")
    return (
      <div className="min-w-0 space-y-6 sm:space-y-8">
        <PageIntro {...intro} />
        <KycGate action="deposit" status={user.kycStatus} />
      </div>
    );

  const [wallets, deposits] = await Promise.all([
    depositWalletList(),
    db.deposit.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const coins: DepositCoin[] = await Promise.all(
    wallets.map(async (c) => ({
      code: c.code,
      name: c.name,
      networks: await Promise.all(
        c.networks.map(async (n) => ({
          ...n,
          qr: n.address ? await QRCode.toDataURL(n.address, { margin: 1, width: 220 }) : null,
        })),
      ),
    })),
  );

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <PageIntro {...intro} />

      <DepositForm coins={coins} sandbox={cryptoMode() === "sandbox"} />

      <section className="glass rounded-[var(--radius-card)] p-5 sm:p-6">
        <h2 className="text-base font-semibold sm:text-lg">Deposit status</h2>
        {deposits.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No deposits yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {deposits.map((d) => {
              const outcome = depositOutcome(d.status);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
                  <StatusBadge outcome={outcome} />
                  <span className="tabular font-semibold">
                    {formatQty(d.amount.toString())} {d.assetCode}
                  </span>
                  {d.network && <span className="text-muted">{d.network}</span>}
                  <span className="font-mono text-xs text-muted">{d.reference}</span>
                  {d.sandbox && <SandboxBadge />}
                  <span className="ml-auto text-xs text-muted">
                    <LocalTime date={d.createdAt.toISOString()} />
                  </span>
                  <span className={outcome === "FAILED" ? "w-full text-xs text-down" : "w-full text-xs text-muted"}>
                    {outcome === "PENDING"
                      ? "Awaiting approval. It's added to your balance once approved."
                      : outcome === "SUCCESS"
                        ? `Approved. ${formatQty(d.amount.minus(d.fee).toString())} ${d.assetCode} was added to your balance.`
                        : `Rejected${d.failureReason ? `: ${d.failureReason}` : ""}. Your balance didn't change.`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
