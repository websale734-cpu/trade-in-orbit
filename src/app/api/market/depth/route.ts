import { chartableSymbol } from "@/lib/market/candles";

/**
 * GET /api/market/depth?asset=BTC
 * Reference market depth (top 12 bids/asks) from Binance's public order book,
 * shown on the Trade page and labelled as the external reference market.
 */
const BASE = process.env.BINANCE_REST_URL ?? "https://data-api.binance.vision";
const cache = new Map<string, { data: unknown; expires: number }>();

export async function GET(request: Request) {
  const asset = (new URL(request.url).searchParams.get("asset") ?? "").toUpperCase();
  const symbol = /^[A-Z]{2,6}$/.test(asset) ? chartableSymbol(asset) : null;
  if (!symbol) return Response.json({ error: "No order book for this asset" }, { status: 404 });

  const hit = cache.get(symbol);
  if (hit && hit.expires > Date.now()) return Response.json(hit.data);
  try {
    const res = await fetch(`${BASE}/api/v3/depth?symbol=${symbol}&limit=12`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const book = (await res.json()) as { bids: [string, string][]; asks: [string, string][] };
    const data = {
      asset,
      bids: book.bids.map(([p, q]) => [Number(p), Number(q)]),
      asks: book.asks.map(([p, q]) => [Number(p), Number(q)]),
      source: "Binance",
    };
    cache.set(symbol, { data, expires: Date.now() + 3_000 });
    return Response.json(data);
  } catch {
    return Response.json({ error: "Order book unavailable" }, { status: 502 });
  }
}
