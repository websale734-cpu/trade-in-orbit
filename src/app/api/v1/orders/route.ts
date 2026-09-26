import { z } from "zod";
import { withApiKey } from "@/server/api-keys";
import { db } from "@/server/db";
import { LedgerError } from "@/server/ledger";
import { executeMarketOrder, placeLimitOrder } from "@/server/trading";
import { PriceUnavailableError } from "@/lib/market/price";
import type { Order } from "@/generated/prisma/client";

const num = z.string().regex(/^\d+(\.\d+)?$/, "Must be a positive decimal string.");
const asset = z.string().regex(/^[A-Z]{2,6}$/);
const orderSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("market"), side: z.enum(["BUY", "SELL"]), base: asset, amount: num, accountId: z.string().optional(), clientOrderId: z.uuid() }),
  z.object({ type: z.literal("limit"), side: z.enum(["BUY", "SELL"]), base: asset, quantity: num, limitPrice: num, accountId: z.string().optional(), clientOrderId: z.uuid() }),
]);

function serializeOrder(o: Order) {
  return {
    id: o.id,
    type: o.type,
    side: o.side,
    base: o.baseAsset,
    quantity: o.quantity.toString(),
    limitPrice: o.limitPrice?.toString() ?? null,
    fillPrice: o.fillPrice?.toString() ?? null,
    fee: o.fee?.toString() ?? null,
    status: o.status,
    accountId: o.accountId,
    createdAt: o.createdAt.toISOString(),
    filledAt: o.filledAt?.toISOString() ?? null,
  };
}

/** GET /api/v1/orders?status=OPEN|FILLED|CANCELLED&limit=50: the key owner's real-money orders. */
export async function GET(request: Request) {
  return withApiKey(request, "READ", async (user) => {
    const sp = new URL(request.url).searchParams;
    const status = z.enum(["OPEN", "FILLED", "CANCELLED"]).safeParse(sp.get("status"));
    const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50));
    const orders = await db.order.findMany({
      where: { userId: user.id, demo: false, ...(status.success ? { status: status.data } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return Response.json({ orders: orders.map(serializeOrder) });
  });
}

/** POST /api/v1/orders: place a market or limit order (TRADE keys only). Real money, never demo. */
export async function POST(request: Request) {
  return withApiKey(request, "TRADE", async (user) => {
    const body = await request.json().catch(() => null);
    const parsed = orderSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message, path: parsed.error.issues[0].path }, { status: 400 });
    const o = parsed.data;
    try {
      if (o.type === "market") {
        const r = await executeMarketOrder({
          userId: user.id,
          accountId: o.accountId ?? null,
          demo: false,
          side: o.side,
          base: o.base,
          amount: o.amount,
          idempotencyKey: `api:${o.clientOrderId}`,
        });
        return Response.json({ order: serializeOrder(r!.order) }, { status: 201 });
      }
      const order = await placeLimitOrder({
        userId: user.id,
        accountId: o.accountId ?? null,
        demo: false,
        side: o.side,
        base: o.base,
        quantity: o.quantity,
        limitPrice: o.limitPrice,
        idempotencyKey: `api:${o.clientOrderId}`,
      });
      return Response.json({ order: serializeOrder(order!) }, { status: 201 });
    } catch (err) {
      if (err instanceof LedgerError)
        return Response.json({ error: err.message, code: err.code }, { status: err.code === "DUPLICATE" ? 409 : 422 });
      if (err instanceof PriceUnavailableError) return Response.json({ error: err.message }, { status: 503 });
      console.error("[api/orders]", err);
      return Response.json({ error: "Order failed. No funds were moved." }, { status: 500 });
    }
  });
}
