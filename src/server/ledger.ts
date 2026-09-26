import "server-only";
import { db } from "./db";
import { Prisma, type EntryType } from "@/generated/prisma/client";

/**
 * Double-entry ledger service. This is the ONLY code that moves money.
 *
 * Every balance change is a journal entry with postings that sum to zero per
 * asset. The database enforces the invariants itself (see the `ledger`
 * migration): postings update balances via trigger, direct balance edits are
 * rejected, history is append-only, entries must balance at commit, and user
 * balances can't go negative. This module adds validation, idempotency and
 * friendly errors on top.
 */
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

type Tx = Prisma.TransactionClient;

export class LedgerError extends Error {
  constructor(
    message: string,
    public code: "INSUFFICIENT_FUNDS" | "INVALID_AMOUNT" | "NOT_FOUND" | "DUPLICATE" | "INVALID",
  ) {
    super(message);
  }
}

export const MAX_ACCOUNTS_PER_USER = 5;

/** Headroom for network latency to the database; ledger transactions are short. */
const TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 } as const;

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

/** Every user gets a default "Trading" account the first time it's needed. */
export async function ensureDefaultAccount(userId: string) {
  const existing = await db.account.findFirst({ where: { userId, isDefault: true } });
  if (existing) return existing;
  return db.account
    .create({ data: { userId, name: "Trading", type: "TRADING", isDefault: true } })
    .catch(async () => db.account.findFirstOrThrow({ where: { userId, isDefault: true } })); // parallel first loads
}

export function listAccounts(userId: string) {
  return db.account.findMany({
    where: { userId, archivedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    include: { ledgerAccounts: { include: { asset: true }, orderBy: { asset: { sortOrder: "asc" } } } },
  });
}

async function ledgerAccountFor(tx: Tx, accountId: string, assetCode: string) {
  return tx.ledgerAccount.upsert({
    where: { accountId_assetCode: { accountId, assetCode } },
    update: {},
    create: { accountId, assetCode },
  });
}

/** A platform-owned ledger account (e.g. FEES, CUSTODY, DEV_FAUCET). */
export async function systemLedgerAccount(tx: Tx, systemCode: string, assetCode: string, allowNegative = false) {
  return tx.ledgerAccount.upsert({
    where: { systemCode_assetCode: { systemCode, assetCode } },
    update: {},
    create: { systemCode, assetCode, allowNegative },
  });
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

/** Parse a user-entered amount, enforcing > 0 and the asset's decimal places. */
export function parseAmount(input: string, decimals: number): Decimal {
  const clean = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(clean)) throw new LedgerError("Enter a valid amount.", "INVALID_AMOUNT");
  const [, frac = ""] = clean.split(".");
  if (frac.length > decimals)
    throw new LedgerError(`Use at most ${decimals} decimal place${decimals === 1 ? "" : "s"}.`, "INVALID_AMOUNT");
  const value = new Decimal(clean);
  if (value.lte(0)) throw new LedgerError("Amount must be greater than zero.", "INVALID_AMOUNT");
  return value;
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

export type PostingInput = { ledgerAccountId: string; assetCode: string; amount: Decimal };

/**
 * Record a journal entry inside an existing transaction. The zero-sum rule is
 * also checked by the database at commit; checking here gives a clear error early.
 */
export async function postEntry(
  tx: Tx,
  entry: {
    type: EntryType;
    description: string;
    userId?: string | null;
    reason?: string;
    idempotencyKey?: string;
    metadata?: Prisma.InputJsonValue;
    postings: PostingInput[];
  },
) {
  const sums = new Map<string, Decimal>();
  for (const p of entry.postings) sums.set(p.assetCode, (sums.get(p.assetCode) ?? new Decimal(0)).plus(p.amount));
  if (entry.postings.length < 2 || [...sums.values()].some((s) => !s.isZero()))
    throw new LedgerError("Journal entry is unbalanced.", "INVALID");

  return tx.journalEntry.create({
    data: {
      type: entry.type,
      description: entry.description,
      userId: entry.userId ?? null,
      reason: entry.reason,
      idempotencyKey: entry.idempotencyKey,
      metadata: entry.metadata,
      postings: {
        // balanceAfter is computed by the database trigger; the placeholder is overwritten.
        create: entry.postings.map((p) => ({ ...p, balanceAfter: new Decimal(0) })),
      },
    },
    include: { postings: true },
  });
}

/** Translate database-level ledger violations into friendly errors. */
export function mapLedgerError(err: unknown): never {
  const msg = err instanceof Error ? `${err.message} ${String((err as { cause?: unknown }).cause ?? "")}` : String(err);
  if (msg.includes("ledger_accounts_non_negative"))
    throw new LedgerError("Insufficient balance.", "INSUFFICIENT_FUNDS");
  if (msg.includes("idempotency_key") || (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"))
    throw new LedgerError("This request was already processed.", "DUPLICATE");
  throw err;
}

// ---------------------------------------------------------------------------
// Use cases
// ---------------------------------------------------------------------------

/** Move funds instantly between two of the same user's accounts. */
export async function transferBetweenAccounts(input: {
  userId: string;
  fromAccountId: string;
  toAccountId: string;
  assetCode: string;
  amount: string;
  idempotencyKey: string;
}) {
  if (input.fromAccountId === input.toAccountId) throw new LedgerError("Choose two different accounts.", "INVALID");

  const [from, to, asset] = await Promise.all([
    db.account.findFirst({ where: { id: input.fromAccountId, userId: input.userId, archivedAt: null } }),
    db.account.findFirst({ where: { id: input.toAccountId, userId: input.userId, archivedAt: null } }),
    db.asset.findFirst({ where: { code: input.assetCode, enabled: true } }),
  ]);
  // Ownership is checked in the query, so another user's account ID simply isn't found.
  if (!from || !to) throw new LedgerError("Account not found.", "NOT_FOUND");
  if (!asset) throw new LedgerError("Unsupported asset.", "NOT_FOUND");
  const amount = parseAmount(input.amount, asset.decimals);

  try {
    return await db.$transaction(async (tx) => {
      // Sequential: queries on one transaction connection can't run in parallel.
      const src = await ledgerAccountFor(tx, from.id, asset.code);
      const dst = await ledgerAccountFor(tx, to.id, asset.code);
      return postEntry(tx, {
        type: "TRANSFER",
        description: `Transfer ${asset.code} from ${from.name} to ${to.name}`,
        userId: input.userId,
        idempotencyKey: `transfer:${input.userId}:${input.idempotencyKey}`,
        metadata: { fromAccountId: from.id, toAccountId: to.id },
        postings: [
          { ledgerAccountId: src.id, assetCode: asset.code, amount: amount.negated() },
          { ledgerAccountId: dst.id, assetCode: asset.code, amount },
        ],
      });
    }, TX_OPTIONS);
  } catch (err) {
    mapLedgerError(err);
  }
}

/** All non-zero balances for a user, per account and asset. */
export async function userHoldings(userId: string) {
  const rows = await db.ledgerAccount.findMany({
    where: { account: { userId, archivedAt: null }, balance: { not: 0 } },
    include: { asset: true, account: { select: { id: true, name: true } } },
    orderBy: { asset: { sortOrder: "asc" } },
  });
  return rows.map((r) => ({
    accountId: r.account!.id,
    accountName: r.account!.name,
    assetCode: r.assetCode,
    assetName: r.asset.name,
    decimals: r.asset.decimals,
    balance: r.balance.toString(),
  }));
}

/** A user's recent journal entries with their postings (for history lists). */
export function recentEntries(userId: string, take = 10) {
  return db.journalEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    include: { postings: { include: { ledgerAccount: { include: { account: { select: { name: true } } } } } } },
  });
}
