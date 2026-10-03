import type { Metadata } from "next";
import { PageIntro } from "@/components/accounts/page-parts";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/server/auth/dal";
import { ensureDefaultAccount, listAccounts } from "@/server/ledger";
import { getDictionary } from "@/i18n/server";
import { TransferForm } from "../accounts/transfer-form";

export const metadata: Metadata = { title: "Transfer" };

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** Move funds between the customer's own accounts. */
export default async function TransferPage({ searchParams }: PageProps<"/transfer">) {
  const { user } = await requireUser("/transfer");
  await ensureDefaultAccount(user.id);
  const [dict, accounts, sp] = await Promise.all([getDictionary(), listAccounts(user.id), searchParams]);
  const t = dict.app.transferPage;

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <PageIntro title={t.title} intro={t.intro} back={{ href: "/accounts", label: dict.app.accounts.allAccounts }} />
      <section className="glass rounded-[var(--radius-card)] p-6">
        {accounts.length < 2 ? (
          <div className="text-center">
            <p className="text-sm text-muted">{t.needTwo}</p>
            <ButtonLink href="/accounts/new" className="mt-5">
              {t.open}
            </ButtonLink>
          </div>
        ) : (
          <TransferForm
            accounts={accounts.map((a) => ({
              id: a.id,
              name: a.name,
              balances: a.ledgerAccounts
                .filter((l) => !l.balance.isZero())
                .map((l) => ({
                  code: l.assetCode,
                  name: l.asset.name,
                  amount: l.balance.toString(),
                  decimals: l.asset.decimals,
                })),
            }))}
            initial={{ fromId: param(sp.from), toId: param(sp.to), assetCode: param(sp.asset)?.toUpperCase() }}
          />
        )}
      </section>
    </div>
  );
}
