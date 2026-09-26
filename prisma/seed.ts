/**
 * DEVELOPMENT SEED DATA. Never run against production.
 *
 *   npm run db:seed
 *
 * Creates demo accounts that are already through onboarding, so you can log in
 * without going through signup. Refuses to run when NODE_ENV=production or when
 * the linked Neon branch is `production`. Seed data lives only on dev branches.
 *
 * Safe to re-run: existing demo users are updated, not duplicated.
 */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { argon2id } from "hash-wasm";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

if (process.env.NODE_ENV === "production" || process.env.NEON_BRANCH === "production") {
  console.error("Refusing to seed: this looks like production. Seed data is for development branches only.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const DEMO_PASSWORD = "Orbtrade-Demo-2026!";

const demoUsers = [
  { email: "demo@orbtrade.dev", name: "Demo Trader", phone: "+447700900001", kycStatus: "NONE" as const },
  { email: "verified@orbtrade.dev", name: "Verified Demo", phone: "+447700900002", kycStatus: "APPROVED" as const },
];

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
      kycStatus: u.kycStatus,
      kycLevel: u.kycStatus === "APPROVED" ? 1 : 0,
      termsAcceptedAt: now,
      termsVersion: "dev-seed",
    };
    await db.user.upsert({ where: { email: u.email }, update: data, create: { email: u.email, ...data } });
    console.log(`  seeded ${u.email} (KYC ${u.kycStatus})`);
  }
  console.log(`\nDemo password for all seeded users: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
