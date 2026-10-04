import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CoinView } from "@/components/coin/coin-view";
import { StarButton } from "@/components/markets/star-button";
import { requireUser } from "@/server/auth/dal";
import { loadCoinPage } from "@/server/coin-page";
import { db } from "@/server/db";
import { trackedCoins } from "@/config/coins";

export async function generateMetadata({ params }: PageProps<"/markets/[symbol]">): Promise<Metadata> {
  const { symbol } = await params;
  const coin = trackedCoins.find((c) => c.symbol === symbol.toUpperCase());
  return { title: coin ? `${coin.name} (${coin.symbol}) price` : "Markets" };
}

export default async function CoinMarketPage({ params }: PageProps<"/markets/[symbol]">) {
  const { symbol } = await params;
  const { user } = await requireUser(`/markets/${symbol}`);
  const coin = await loadCoinPage(symbol);
  if (!coin) notFound();
  const watching = await db.watchlistItem.findUnique({
    where: { userId_assetCode: { userId: user.id, assetCode: coin.code } },
    select: { assetCode: true },
  });

  return (
    <CoinView
      code={coin.code}
      name={coin.name}
      pair={coin.pair}
      invert={coin.invert}
      initialStats={coin.stats}
      trading={coin.trading}
      backHref="/markets"
      star={<StarButton assetCode={coin.code} watching={!!watching} />}
    />
  );
}
