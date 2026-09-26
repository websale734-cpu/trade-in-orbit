/**
 * Test helper (dev branches only): reset transient state for a test user so
 * end-to-end runs are repeatable: clears their rate-limit counters and cancels
 * leftover open limit orders (returning escrow through the ledger).
 *
 *   npx tsx tests/reset-test-user.ts verified@orbtrade.dev
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local", quiet: true });
if (process.env.NODE_ENV === "production" || process.env.NEON_BRANCH === "production") {
  console.error("Refusing to run against production.");
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const email = process.argv[2];
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const { count } = await db.rateLimit.deleteMany({ where: { key: { contains: user.id } } });
  const open = await db.order.findMany({ where: { userId: user.id, status: "OPEN" } });
  for (const o of open) {
    const hold = o.side === "BUY" ? "USD" : o.baseAsset;
    await db.$transaction(async (tx) => {
      await tx.order.update({ where: { id: o.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      const escrow = await tx.ledgerAccount.findUniqueOrThrow({
        where: { systemCode_assetCode: { systemCode: o.demo ? "DEMO_ORDER_ESCROW" : "ORDER_ESCROW", assetCode: hold } },
      });
      const acct = await tx.ledgerAccount.findUniqueOrThrow({
        where: { accountId_assetCode: { accountId: o.accountId, assetCode: hold } },
      });
      await tx.journalEntry.create({
        data: {
          type: "TRADE",
          description: "Test reset: limit order cancelled",
          userId: user.id,
          postings: {
            create: [
              {
                ledgerAccountId: escrow.id,
                assetCode: hold,
                amount: o.escrow!.negated(),
                balanceAfter: new Prisma.Decimal(0),
              },
              { ledgerAccountId: acct.id, assetCode: hold, amount: o.escrow!, balanceAfter: new Prisma.Decimal(0) },
            ],
          },
        },
      });
    });
  }
  console.log(`reset ${email}: ${count} rate-limit counters cleared, ${open.length} open orders cancelled`);
}
main().finally(() => db.$disconnect());
