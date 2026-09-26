import type { Metadata } from "next";
import { MarketsTable } from "@/components/markets/markets-table";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{dict.app.markets.title}</h1>
        <p className="mt-1 text-sm text-muted">{dict.app.markets.subtitle}</p>
      </div>
      <MarketsTable watching={watch.map((w) => w.assetCode)} />
    </div>
  );
}
