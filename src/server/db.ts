import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

/**
 * Prisma client (one per server process), using Neon's pooled connection string.
 *
 * Created lazily on first query, not at import time, so `next build` can
 * analyse routes without database credentials or runtime secrets. In
 * development the instance is cached on globalThis so hot reloads don't open a
 * new pool on every file change.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  if (!globalForPrisma.prisma) {
    // Keep connections warm (new TLS connections to a remote database are slow)
    // and allow enough of them for a page's parallel queries plus a transaction.
    const adapter = new PrismaPg({
      connectionString: env().DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 60_000,
      connectionTimeoutMillis: 15_000,
    });
    globalForPrisma.prisma = new PrismaClient({
      adapter,
      // Default for interactive transactions: time to acquire a connection / total runtime.
      transactionOptions: { maxWait: 10_000, timeout: 20_000 },
    });
  }
  return globalForPrisma.prisma;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
