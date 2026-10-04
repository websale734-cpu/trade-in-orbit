import type { Metadata } from "next";
import { MarketsTable } from "@/components/markets/markets-table";
import { PageHeader, PageStack } from "@/components/app/ui";
import { requireUser } from "@/server/auth/dal";
import { db } from "@/server/db";
import { getDictionary } from "@/i18n/server";

export const metadata: Metadata = { title: "Markets" };

export default async function MarketsPage() {
  const { user } = await requireUser("/markets");
  const [dict, watch] = await Promise.all([
    getDictionary(),
    db.watchlistItem.findMany({ where: { userId: user.id }, select: { assetCode: true } }),
  ]);
  return (
    <PageStack>
      <PageHeader title={dict.app.markets.title} subtitle={dict.app.markets.subtitle} />
      <MarketsTable watching={watch.map((w) => w.assetCode)} />
    </PageStack>
  );
}
