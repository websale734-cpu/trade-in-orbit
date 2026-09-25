import { getMarketSnapshot } from "@/lib/market/coingecko";

/**
 * GET /api/market/tickers
 * Public market snapshot used by the landing page as a polling fallback when the
 * real-time WebSocket is unavailable. Cached server-side (see coingecko.ts).
 */
export async function GET() {
  const snapshot = await getMarketSnapshot();
  return Response.json(snapshot, {
    headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
  });
}
