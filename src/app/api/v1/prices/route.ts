import { withApiKey } from "@/server/api-keys";
import { db } from "@/server/db";
import { getMarketSnapshot } from "@/lib/market/coingecko";

/** GET /api/v1/prices: indicative USD prices for coins that are open for trading. */
export async function GET(request: Request) {
  return withApiKey(request, "READ", async () => {
    const [snapshot, tradable] = await Promise.all([
      getMarketSnapshot(),
      db.asset.findMany({ where: { enabled: true, tradingEnabled: true }, select: { code: true } }),
    ]);
    if (snapshot.unavailable) return Response.json({ error: "Prices are temporarily unavailable." }, { status: 503 });
    const open = new Set(tradable.map((a) => a.code));
    return Response.json({
      fetchedAt: snapshot.fetchedAt,
      prices: snapshot.tickers
        .filter((t) => open.has(t.symbol))
        .map((t) => ({ asset: t.symbol, priceUsd: t.priceUsd, change24hPct: t.change24hPct })),
      note: "Indicative prices. Orders execute at the live price at the time of execution.",
    });
  });
}
