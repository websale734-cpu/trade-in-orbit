/**
 * DEVELOPMENT SEED DATA. Never run against production.
 *
 *   npm run db:seed
 *
 * Creates demo accounts that are already through onboarding, with Trading and
 * Savings accounts, demo balances and a watchlist. Refuses to run when
 * NODE_ENV=production or when DATABASE_ENV=production. Seed data lives only on
 * development databases.
 *
 * Balances are created the only way the ledger allows: balanced DEV_SEED
 * journal entries from a dev-only DEV_FAUCET system account. Safe to re-run
 * (users are upserted; funding is idempotent per user).
 */
import { config } from "dotenv";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { argon2id } from "hash-wasm";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

if (process.env.NODE_ENV === "production" || process.env.DATABASE_ENV === "production") {
  console.error("Refusing to seed: this looks like production. Seed data is for development databases only.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const DEMO_PASSWORD = "Orbtrade-Demo-2026!";

/** Dev-only authenticator secret for seeded staff (add it to any authenticator app). */
const DEV_STAFF_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

/** Same AES-256-GCM layout as src/server/crypto.ts ([iv][tag][data]). */
function encrypt(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(process.env.DATA_ENCRYPTION_KEY!, "base64"), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]);
}

// A tiny valid PNG (1x1 px) standing in for document images in the dev KYC queue.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

type Funding = Record<string, string>;
const demoUsers: {
  email: string;
  name: string;
  phone: string;
  kyc: "NONE" | "APPROVED";
  trading: Funding;
  savings: Funding;
}[] = [
  {
    email: "demo@orbtrade.dev",
    name: "Demo Trader",
    phone: "+447700900001",
    kyc: "NONE",
    trading: { USD: "1250", BTC: "0.0425", ETH: "0.85" },
    savings: { USDT: "500" },
  },
  {
    email: "verified@orbtrade.dev",
    name: "Verified Demo",
    phone: "+447700900002",
    kyc: "APPROVED",
    trading: { USD: "4800", BTC: "0.18", ETH: "2.4", SOL: "35", XRP: "1200", DOGE: "5000" },
    savings: { USDT: "2500", BTC: "0.05" },
  },
];

async function fund(tx: Prisma.TransactionClient, userId: string, accountId: string, funding: Funding) {
  for (const [assetCode, amount] of Object.entries(funding)) {
    const faucet = await tx.ledgerAccount.upsert({
      where: { systemCode_assetCode: { systemCode: "DEV_FAUCET", assetCode } },
      update: {},
      create: { systemCode: "DEV_FAUCET", assetCode, allowNegative: true },
    });
    const target = await tx.ledgerAccount.upsert({
      where: { accountId_assetCode: { accountId, assetCode } },
      update: {},
      create: { accountId, assetCode },
    });
    await tx.journalEntry.create({
      data: {
        type: "DEV_SEED",
        description: `Development funding: ${amount} ${assetCode}`,
        userId,
        postings: {
          create: [
            { ledgerAccountId: faucet.id, assetCode, amount: new Prisma.Decimal(amount).negated(), balanceAfter: 0 },
            { ledgerAccountId: target.id, assetCode, amount: new Prisma.Decimal(amount), balanceAfter: 0 },
          ],
        },
      },
    });
  }
}

async function main() {
  const passwordHash = await argon2id({
    password: DEMO_PASSWORD,
    salt: randomBytes(16),
    parallelism: 1,
    iterations: 2,
    memorySize: 19_456,
    hashLength: 32,
    outputType: "encoded",
  });
  const now = new Date();

  for (const u of demoUsers) {
    const data = {
      name: u.name,
      passwordHash,
      emailVerifiedAt: now,
      phone: u.phone,
      phoneVerifiedAt: now,
      twoFactorPromptedAt: now,
      kycStatus: u.kyc,
      kycLevel: u.kyc === "APPROVED" ? 1 : 0,
      termsAcceptedAt: now,
      termsVersion: "dev-seed",
    };
    const user = await db.user.upsert({ where: { email: u.email }, update: data, create: { email: u.email, ...data } });

    const trading = await db.account.upsert({
      where: { userId_name: { userId: user.id, name: "Trading" } },
      update: {},
      create: { userId: user.id, name: "Trading", type: "TRADING", isDefault: true },
    });
    const savings = await db.account.upsert({
      where: { userId_name: { userId: user.id, name: "Savings" } },
      update: {},
      create: { userId: user.id, name: "Savings", type: "SAVINGS" },
    });

    const alreadyFunded = await db.journalEntry.findFirst({ where: { userId: user.id, type: "DEV_SEED" } });
    if (!alreadyFunded) {
      await db.$transaction(
        async (tx) => {
          await fund(tx, user.id, trading.id, u.trading);
          await fund(tx, user.id, savings.id, u.savings);
        },
        { timeout: 60_000, maxWait: 10_000 },
      );
    }

    for (const assetCode of ["BTC", "ETH", "SOL"]) {
      await db.watchlistItem.upsert({
        where: { userId_assetCode: { userId: user.id, assetCode } },
        update: {},
        create: { userId: user.id, assetCode },
      });
    }
    console.log(`  seeded ${u.email} (KYC ${u.kyc})${alreadyFunded ? " (already funded)" : " + demo balances"}`);
  }
  // Staff accounts (2FA pre-enabled with the dev secret, since the admin area requires it).
  const staff = [
    { email: "admin@orbtrade.dev", name: "Dev Super Admin", role: "SUPER_ADMIN" as const, phone: "+447700900010" },
    { email: "support@orbtrade.dev", name: "Dev Support Agent", role: "SUPPORT" as const, phone: "+447700900011" },
  ];
  for (const s of staff) {
    const data = {
      name: s.name,
      role: s.role,
      passwordHash,
      emailVerifiedAt: now,
      phone: s.phone,
      phoneVerifiedAt: now,
      twoFactorPromptedAt: now,
      totpSecretEnc: encrypt(Buffer.from(DEV_STAFF_TOTP_SECRET)).toString("base64"),
      totpEnabledAt: now,
      termsAcceptedAt: now,
      termsVersion: "dev-seed",
    };
    await db.user.upsert({ where: { email: s.email }, update: data, create: { email: s.email, ...data } });
    console.log(`  seeded ${s.email} (${s.role}, 2FA on)`);
  }

  // A pending KYC submission so the admin review queue has something in it.
  const demo = await db.user.findUniqueOrThrow({ where: { email: "demo@orbtrade.dev" } });
  if (demo.kycStatus === "NONE") {
    await db.$transaction([
      db.kycSubmission.create({
        data: {
          userId: demo.id,
          documentType: "PASSPORT",
          documentCountry: "GB",
          files: {
            create: (["ID_FRONT", "SELFIE"] as const).map((kind) => ({
              kind,
              mimeType: "image/png",
              sizeBytes: TINY_PNG.length,
              sha256: createHash("sha256").update(TINY_PNG).digest("hex"),
              dataEnc: new Uint8Array(encrypt(TINY_PNG)),
            })),
          },
        },
      }),
      db.user.update({ where: { id: demo.id }, data: { kycStatus: "PENDING" } }),
    ]);
    console.log("  seeded a pending KYC submission for demo@orbtrade.dev");
  }

  console.log(`\nDemo password for all seeded users: ${DEMO_PASSWORD}`);
  console.log(`Staff authenticator secret (dev only): ${DEV_STAFF_TOTP_SECRET}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
