import type { Metadata } from "next";
import { PageIntro } from "@/components/accounts/page-parts";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { ensureDefaultAccount, listAccounts } from "@/server/ledger";
import { userTradeFees } from "@/server/trading";
import { MAX_SLIPPAGE_BPS } from "@/config/funding";
import { getDictionary } from "@/i18n/server";
import { ConvertForm } from "./convert-form";

export const metadata: Metadata = { title: "Convert" };

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** Swap one asset for another inside one of the customer's accounts. */
export default async function ConvertPage({ searchParams }: PageProps<"/convert">) {
  const { user } = await requireUser("/convert");
  await ensureDefaultAccount(user.id);
  const [dict, accounts, assets, fees, sp] = await Promise.all([
    getDictionary(),
    listAccounts(user.id),
    // Only assets the swap engine accepts right now (admins can close a coin's trading pair).
    db.asset.findMany({
      where: { enabled: true, OR: [{ tradingEnabled: true }, { code: "USD" }] },
      orderBy: { sortOrder: "asc" },
      select: { code: true, name: true, decimals: true },
    }),
    userTradeFees(user.id, false),
    searchParams,
  ]);
  const t = dict.app.convert;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <PageIntro title={t.title} intro={t.intro} back={{ href: "/accounts", label: dict.app.accounts.allAccounts }} />
      <section className="glass rounded-[var(--radius-card)] p-6">
        <ConvertForm
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            balances: Object.fromEntries(a.ledgerAccounts.map((l) => [l.assetCode, l.balance.toString()])),
          }))}
          assets={assets}
          feeBps={fees.instant}
          slippagePct={MAX_SLIPPAGE_BPS / 100}
          initial={{ accountId: param(sp.account), from: param(sp.from)?.toUpperCase(), to: param(sp.to)?.toUpperCase() }}
        />
      </section>
    </div>
  );
}
