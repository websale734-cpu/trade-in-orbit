import { withApiKey } from "@/server/api-keys";
import { LedgerError } from "@/server/ledger";
import { cancelOrder } from "@/server/trading";

/** DELETE /api/v1/orders/:id: cancel one of the key owner's open limit orders (TRADE keys only). */
export async function DELETE(request: Request, ctx: RouteContext<"/api/v1/orders/[id]">) {
  return withApiKey(request, "TRADE", async (user) => {
    const { id } = await ctx.params;
    try {
      await cancelOrder(user.id, id);
      return Response.json({ id, status: "CANCELLED" });
    } catch (err) {
      if (err instanceof LedgerError) return Response.json({ error: err.message }, { status: 404 });
      throw err;
    }
  });
}
