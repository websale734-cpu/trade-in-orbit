import { getCandles, isTimeframe } from "@/lib/market/candles";

/**
 * GET /api/market/candles?asset=BTC&tf=1D
 * Public price history for the dashboard chart. Only tracked assets and known
 * timeframes are accepted, so this can't be used as an open proxy.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const asset = (searchParams.get("asset") ?? "").toUpperCase();
  const tf = searchParams.get("tf") ?? "1D";
  if (!/^[A-Z]{2,6}$/.test(asset) || !isTimeframe(tf)) return Response.json({ error: "Bad request" }, { status: 400 });

  const candles = await getCandles(asset, tf);
  if (!candles) return Response.json({ error: "No chart data for this asset" }, { status: 404 });
  return Response.json(
    { asset, tf, candles },
    { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" } },
  );
}
