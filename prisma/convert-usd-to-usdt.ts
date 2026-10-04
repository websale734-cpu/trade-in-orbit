/**
 * One-time migration for the crypto-only platform: every customer's USD cash
 * balance becomes the same amount of USDT (1:1), through the ledger.
 *
 *   npx tsx prisma/convert-usd-to-usdt.ts                      # dry run on .env.local
 *   npx tsx prisma/convert-usd-to-usdt.ts --apply              # convert on .env.local
 *   npx tsx prisma/convert-usd-to-usdt.ts --env .env.production.local --apply --production
 *
 * For each account (real and demo) it first cancels open limit BUY orders that
 * reserved USD (the escrow goes back to the account), then posts one balanced
 * TRADE entry per account: USD -> broker, broker -> USDT. Idempotent: an account
 * with no USD left is skipped, and each entry has a unique idempotency key.
 * Customers with a real balance get an in-app notification.
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";

const args = process.argv.slice(2);
const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : ".env.local";
const apply = args.includes("--apply");
config({ path: envFile, quiet: true, override: true });
if (process.env.DATABASE_ENV === "production" && !args.includes("--production")) {
  console.error(`${envFile} points at PRODUCTION. Add --production to confirm.`);
  process.exit(1);
}
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!.replace(/sslmode=[^&]*/, "sslmode=no-verify") }),
});
const TX = { timeout: 30_000, maxWait: 10_000 } as const;
const FROM = "USD";
const TO = "USDT";

type Tx = Prisma.TransactionClient;
const system = (tx: Tx, systemCode: string, assetCode: string) =>
  tx.ledgerAccount.upsert({
    where: { systemCode_assetCode: { systemCode, assetCode } },
    update: {},
    create: { systemCode, assetCode, allowNegative: true },
  });
const userLa = (tx: Tx, accountId: string, assetCode: string) =>
  tx.ledgerAccount.upsert({
    where: { accountId_assetCode: { accountId, assetCode } },
    update: {},
    create: { accountId, assetCode },
  });
const post = (
  tx: Tx,
  e: { description: string; userId: string; key: string; metadata: object },
  postings: { ledgerAccountId: string; assetCode: string; amount: Prisma.Decimal }[],
) =>
  tx.journalEntry.create({
    data: {
      type: "TRADE",
      description: e.description,
      userId: e.userId,
      idempotencyKey: e.key,
      metadata: e.metadata,
      // balanceAfter is computed by the database trigger.
      postings: { create: postings.map((p) => ({ ...p, balanceAfter: new Prisma.Decimal(0) })) },
    },
  });

async function main() {
  const host = new URL(process.env.DATABASE_URL!).hostname;
  console.log(`${apply ? "APPLYING" : "DRY RUN"} on ${envFile} (${host})\n`);

  // 1. Open limit BUY orders placed while trades were priced in USD still hold USD in escrow.
  const open = await db.order.findMany({ where: { status: "OPEN", type: "LIMIT", side: "BUY" } });
  for (const o of open) {
    const legs = o.entryId ? await db.posting.findMany({ where: { entryId: o.entryId, assetCode: FROM } }) : [];
    if (!legs.length) continue;
    console.log(`cancel order ${o.id} (${o.demo ? "demo" : "real"}): release ${o.escrow} ${FROM}`);
    if (!apply) continue;
    await db.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: o.id, status: "OPEN" },
        data: { status: "CANCELLED", cancelledAt: new Date() },
      });
      if (claimed.count !== 1) return;
      const escrow = await system(tx, o.demo ? "DEMO_ORDER_ESCROW" : "ORDER_ESCROW", FROM);
      const user = await userLa(tx, o.accountId, FROM);
      await post(
        tx,
        {
          description: `Limit order cancelled: ${o.escrow} ${FROM} released (cash balances are now held in ${TO})`,
          userId: o.userId,
          key: `usd-to-usdt-cancel:${o.id}`,
          metadata: { orderId: o.id, cancel: true, conversion: `${FROM}->${TO}` },
        },
        [
          { ledgerAccountId: escrow.id, assetCode: FROM, amount: o.escrow!.negated() },
          { ledgerAccountId: user.id, assetCode: FROM, amount: o.escrow! },
        ],
      );
      await tx.notification.create({
        data: {
          userId: o.userId,
          type: "ACCOUNT",
          title: "Limit order cancelled",
          body: `Your limit buy for ${o.quantity} ${o.baseAsset} was cancelled because trades are now paid in ${TO}. Place it again any time.`,
          link: "/trade",
        },
      });
    }, TX);
  }

  // 2. Cash deposits still waiting for confirmation can no longer be credited: reject them.
  const cashDeposits = await db.deposit.findMany({ where: { status: "PENDING", method: { not: "CRYPTO" } } });
  for (const d of cashDeposits) {
    console.log(`reject pending ${d.method} deposit ${d.reference}: ${d.amount} ${d.assetCode}`);
    if (!apply) continue;
    const { count } = await db.deposit.updateMany({
      where: { id: d.id, status: "PENDING" },
      data: { status: "FAILED", failureReason: "Cash deposits are no longer supported" },
    });
    if (count)
      await db.notification.create({
        data: {
          userId: d.userId,
          type: "ACCOUNT",
          title: "Deposit rejected",
          body: `Your ${d.method.replace("_", " ").toLowerCase()} deposit ${d.reference} was rejected: cash deposits are no longer supported. Please deposit crypto instead.`,
          link: "/deposit",
        },
      });
  }

  // 3. Convert every remaining USD balance 1:1.
  const balances = await db.ledgerAccount.findMany({
    where: { assetCode: FROM, accountId: { not: null }, balance: { gt: 0 } },
    include: { account: { select: { id: true, userId: true, type: true, name: true } } },
  });
  let total = new Prisma.Decimal(0);
  for (const la of balances) {
    const acct = la.account!;
    const demo = acct.type === "DEMO";
    console.log(`${acct.userId} ${acct.name} (${acct.type}): ${la.balance} ${FROM} -> ${la.balance} ${TO}`);
    if (!demo) total = total.plus(la.balance);
    if (!apply) continue;
    await db.$transaction(async (tx) => {
      const fresh = await tx.ledgerAccount.findUniqueOrThrow({ where: { id: la.id } });
      const amount = fresh.balance;
      if (amount.lte(0)) return;
      const broker = demo ? "DEMO_BROKER" : "BROKER";
      const bFrom = await system(tx, broker, FROM);
      const bTo = await system(tx, broker, TO);
      const uTo = await userLa(tx, acct.id, TO);
      await post(
        tx,
        {
          description: `Cash balance converted: ${amount} ${FROM} to ${amount} ${TO} (1:1)`,
          userId: acct.userId,
          key: `usd-to-usdt:${la.id}`,
          metadata: { conversion: `${FROM}->${TO}`, rate: "1", demo },
        },
        [
          { ledgerAccountId: la.id, assetCode: FROM, amount: amount.negated() },
          { ledgerAccountId: bFrom.id, assetCode: FROM, amount },
          { ledgerAccountId: bTo.id, assetCode: TO, amount: amount.negated() },
          { ledgerAccountId: uTo.id, assetCode: TO, amount },
        ],
      );
      if (!demo)
        await tx.notification.create({
          data: {
            userId: acct.userId,
            type: "ACCOUNT",
            title: `Balance converted to ${TO}`,
            body: `Trade In Orbit now holds balances in crypto only. Your ${amount} ${FROM} balance in ${acct.name} is now ${amount} ${TO} (1:1).`,
            link: "/history",
          },
        });
    }, TX);
  }
  console.log(`\n${balances.length} account(s); real customer total ${total} ${FROM} -> ${TO}.`);
  if (apply) {
    const left = await db.ledgerAccount.count({
      where: { assetCode: FROM, accountId: { not: null }, balance: { not: 0 } },
    });
    console.log(`Customer ${FROM} balances left: ${left}`);
  } else console.log("Dry run only. Re-run with --apply to convert.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
