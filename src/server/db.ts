import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

/**
 * Prisma client (one per server process), using Supabase's pooled connection string.
 *
 * Created lazily on first query, not at import time, so `next build` can
 * analyse routes without database credentials or runtime secrets. In
 * development the instance is cached on globalThis so hot reloads don't open a
 * new pool on every file change.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Failures while *acquiring* a connection (e.g. a transient pooler hiccup or a
 * paused project waking up). These happen before any SQL reaches the database,
 * so a retry can't apply a write twice. Errors after a query was sent are
 * never retried.
 */
function isConnectError(err: unknown): boolean {
  const text = `${err instanceof Error ? err.message : err} ${String((err as { cause?: unknown })?.cause ?? "")}`;
  return /connection timeout|timeout exceeded when trying to connect|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(text);
}

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
    const base = new PrismaClient({
      adapter,
      // Default for interactive transactions: time to acquire a connection / total runtime.
      transactionOptions: { maxWait: 10_000, timeout: 20_000 },
    });
    globalForPrisma.prisma = base.$extends({
      query: {
        async $allOperations({ args, query }) {
          try {
            return await query(args);
          } catch (err) {
            if (!isConnectError(err)) throw err;
            console.warn("[db] connection failed, retrying once:", err instanceof Error ? err.message : err);
            await new Promise((r) => setTimeout(r, 750));
            return query(args);
          }
        },
      },
    }) as unknown as PrismaClient;
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
