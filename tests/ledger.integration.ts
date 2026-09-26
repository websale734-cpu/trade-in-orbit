/**
 * Ledger integrity test: attacks the database-level guarantees directly.
 *
 *   npm run test:ledger
 *
 * Runs against the linked Neon branch (refuses `production`). It creates a
 * throwaway user; because the ledger is append-only, that test data stays on
 * the dev branch (reset the branch from its parent to clear it).
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
if (process.env.NODE_ENV === "production" || process.env.NEON_BRANCH === "production") {
  console.error("Refusing to run ledger tests against production.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const D = (v: string | number) => new Prisma.Decimal(v);
let failures = 0;

function report(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function expectReject(name: string, fn: () => Promise<unknown>, match: RegExp) {
  try {
    await fn();
    report(name, false, "was allowed");
  } catch (err) {
    const msg = `${(err as Error).message} ${String((err as { cause?: unknown }).cause ?? "")}`;
    report(name, match.test(msg), match.test(msg) ? "" : msg.slice(0, 200));
  }
}

async function main() {
  const stamp = Date.now();
  const user = await db.user.create({
    data: {
      email: `ledger-test+${stamp}@orbtrade.dev`,
      name: "Ledger Test",
      passwordHash: "x",
      termsAcceptedAt: new Date(),
      termsVersion: "test",
    },
  });
  const [a, b] = await Promise.all([
    db.account.create({ data: { userId: user.id, name: "A", type: "TRADING", isDefault: true } }),
    db.account.create({ data: { userId: user.id, name: "B", type: "SAVINGS" } }),
  ]);
  const la = await db.ledgerAccount.create({ data: { accountId: a.id, assetCode: "BTC" } });
  const lb = await db.ledgerAccount.create({ data: { accountId: b.id, assetCode: "BTC" } });
  const faucet = await db.ledgerAccount.upsert({
    where: { systemCode_assetCode: { systemCode: "TEST_FAUCET", assetCode: "BTC" } },
    update: {},
    create: { systemCode: "TEST_FAUCET", assetCode: "BTC", allowNegative: true },
  });

  const entry = (postings: { id: string; amount: string; asset?: string }[], key?: string) =>
    db.journalEntry.create({
      data: {
        type: "DEV_SEED",
        description: "test",
        userId: user.id,
        idempotencyKey: key,
        postings: {
          create: postings.map((p) => ({
            ledgerAccountId: p.id,
            assetCode: p.asset ?? "BTC",
            amount: D(p.amount),
            balanceAfter: D(0),
          })),
        },
      },
      include: { postings: true },
    });

  // Happy path: fund A with 1 BTC from the faucet.
  const funded = await entry([
    { id: faucet.id, amount: "-1" },
    { id: la.id, amount: "1" },
  ]);
  const aBal = (await db.ledgerAccount.findUniqueOrThrow({ where: { id: la.id } })).balance;
  report("balanced entry posts and updates balance via trigger", aBal.equals(D(1)));
  report(
    "posting records balance_after",
    funded.postings.find((p) => p.ledgerAccountId === la.id)!.balanceAfter.equals(D(1)),
  );

  // Transfer 0.4 A -> B.
  await entry([
    { id: la.id, amount: "-0.4" },
    { id: lb.id, amount: "0.4" },
  ]);
  const [a2, b2] = await Promise.all([
    db.ledgerAccount.findUniqueOrThrow({ where: { id: la.id } }),
    db.ledgerAccount.findUniqueOrThrow({ where: { id: lb.id } }),
  ]);
  report("transfer moves funds between accounts", a2.balance.equals(D("0.6")) && b2.balance.equals(D("0.4")));

  await expectReject(
    "overdraft rejected (balance can't go negative)",
    () =>
      entry([
        { id: la.id, amount: "-5" },
        { id: lb.id, amount: "5" },
      ]),
    /ledger_accounts_non_negative/,
  );

  await expectReject(
    "unbalanced entry rejected at commit",
    () =>
      db.$transaction(async (tx) => {
        await tx.journalEntry.create({
          data: {
            type: "DEV_SEED",
            description: "unbalanced",
            postings: {
              create: [
                { ledgerAccountId: faucet.id, assetCode: "BTC", amount: D(-2), balanceAfter: D(0) },
                { ledgerAccountId: la.id, assetCode: "BTC", amount: D(1), balanceAfter: D(0) },
              ],
            },
          },
        });
      }),
    /unbalanced/,
  );

  await expectReject(
    "entry with no postings rejected",
    () => db.journalEntry.create({ data: { type: "DEV_SEED", description: "empty" } }),
    /at least two postings/,
  );

  await expectReject(
    "direct balance edit rejected",
    () => db.ledgerAccount.update({ where: { id: la.id }, data: { balance: D(1000) } }),
    /only through journal postings/,
  );

  const anyPosting = funded.postings[0];
  await expectReject(
    "posting UPDATE rejected (append-only)",
    () => db.posting.update({ where: { id: anyPosting.id }, data: { amount: D(-100) } }),
    /append-only/,
  );
  await expectReject(
    "posting DELETE rejected (append-only)",
    () => db.posting.delete({ where: { id: anyPosting.id } }),
    /append-only/,
  );
  await expectReject(
    "journal entry DELETE rejected (append-only)",
    () => db.journalEntry.delete({ where: { id: funded.id } }),
    /append-only|foreign key/,
  );

  await expectReject(
    "posting asset must match ledger account asset",
    () =>
      entry([
        { id: la.id, amount: "-0.1", asset: "ETH" },
        { id: lb.id, amount: "0.1", asset: "ETH" },
      ]),
    /does not match/,
  );

  await expectReject(
    "ledger account needs exactly one owner",
    () => db.ledgerAccount.create({ data: { accountId: a.id, systemCode: "X", assetCode: "ETH" } }),
    /one_owner/,
  );

  const key = `idem-${stamp}`;
  await entry(
    [
      { id: la.id, amount: "-0.1" },
      { id: lb.id, amount: "0.1" },
    ],
    key,
  );
  await expectReject(
    "idempotency key prevents double posting",
    () =>
      entry(
        [
          { id: la.id, amount: "-0.1" },
          { id: lb.id, amount: "0.1" },
        ],
        key,
      ),
    /idempotency_key|Unique constraint/,
  );

  // Concurrency: two parallel transfers that together exceed the balance.
  const before = (await db.ledgerAccount.findUniqueOrThrow({ where: { id: la.id } })).balance; // 0.5
  const results = await Promise.allSettled([
    entry([
      { id: la.id, amount: "-0.4" },
      { id: lb.id, amount: "0.4" },
    ]),
    entry([
      { id: la.id, amount: "-0.4" },
      { id: lb.id, amount: "0.4" },
    ]),
  ]);
  const after = (await db.ledgerAccount.findUniqueOrThrow({ where: { id: la.id } })).balance;
  report(
    "concurrent double-spend: exactly one succeeds",
    results.filter((r) => r.status === "fulfilled").length === 1 && after.equals(before.minus("0.4")),
    `before ${before} after ${after}`,
  );

  // Reconciliation: every balance equals the sum of its postings.
  const drift = await db.$queryRaw<{ id: string }[]>`
    SELECT la.id FROM ledger_accounts la
    LEFT JOIN postings p ON p.ledger_account_id = la.id
    GROUP BY la.id, la.balance HAVING la.balance <> COALESCE(sum(p.amount), 0)`;
  report("reconciliation: all balances equal the sum of postings", drift.length === 0, `${drift.length} drifted`);

  console.log(`\n${failures === 0 ? "All ledger checks passed" : `${failures} check(s) FAILED`}`);
}

main()
  .catch((err) => {
    console.error(err);
    failures++;
  })
  .finally(async () => {
    await db.$disconnect();
    process.exit(failures ? 1 : 0);
  });
