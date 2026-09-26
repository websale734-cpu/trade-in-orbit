import { withApiKey } from "@/server/api-keys";
import { listAccounts } from "@/server/ledger";

/** GET /api/v1/account: the key owner's real (non-demo) accounts and balances. */
export async function GET(request: Request) {
  return withApiKey(request, "READ", async (user) => {
    const accounts = await listAccounts(user.id);
    return Response.json({
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        default: a.isDefault,
        balances: a.ledgerAccounts
          .filter((l) => !l.balance.isZero())
          .map((l) => ({ asset: l.assetCode, balance: l.balance.toString() })),
      })),
    });
  });
}
