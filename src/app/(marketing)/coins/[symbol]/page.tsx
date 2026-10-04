import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CoinView } from "@/components/coin/coin-view";
import { MarketProvider } from "@/components/market/market-provider";
import { Container } from "@/components/ui/section";
import { getSession } from "@/server/auth/session";
import { loadCoinPage } from "@/server/coin-page";
import { getMarketSnapshot } from "@/lib/market/coingecko";
import { trackedCoins } from "@/config/coins";

export async function generateMetadata({ params }: PageProps<"/coins/[symbol]">): Promise<Metadata> {
  const { symbol } = await params;
  const coin = trackedCoins.find((c) => c.symbol === symbol.toUpperCase());
  return coin
    ? {
        title: `${coin.name} (${coin.symbol}) price and live chart`,
        description: `Live ${coin.name} price, 24h change and candlestick chart on Trade In Orbit.`,
      }
    : { title: "Markets" };
}

/** Public coin page, linked from the landing page's markets. Signed-in visitors get the in-app version. */
export default async function PublicCoinPage({ params }: PageProps<"/coins/[symbol]">) {
  const { symbol } = await params;
  const [coin, session, snapshot] = await Promise.all([loadCoinPage(symbol), getSession(), getMarketSnapshot()]);
  if (!coin) notFound();
  if (session) redirect(`/markets/${coin.code}`);

  return (
    <MarketProvider initial={snapshot}>
      <Container className="py-8 sm:py-12">
        <CoinView
          code={coin.code}
          name={coin.name}
          pair={coin.pair}
          invert={coin.invert}
          initialStats={coin.stats}
          trading={coin.trading}
          backHref="/#markets"
        />
      </Container>
    </MarketProvider>
  );
}
