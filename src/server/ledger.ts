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
const TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

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

/** Real (non-demo) accounts. The demo account lives only on the Trade page. */
export function listAccounts(userId: string) {
  return db.account.findMany({
    where: { userId, archivedAt: null, type: { not: "DEMO" } },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    // Crypto only: the legacy USD cash asset is never shown.
    include: {
      ledgerAccounts: {
        where: { asset: { type: "CRYPTO" } },
        include: { asset: true },
        orderBy: { asset: { sortOrder: "asc" } },
      },
    },
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
  // Zero legs (e.g. a fee that rounds to nothing) are dropped; the database rejects them.
  const postings = entry.postings.filter((p) => !p.amount.isZero());
  const sums = new Map<string, Decimal>();
  for (const p of postings) sums.set(p.assetCode, (sums.get(p.assetCode) ?? new Decimal(0)).plus(p.amount));
  if (postings.length < 2 || [...sums.values()].some((s) => !s.isZero()))
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
        create: postings.map((p) => ({ ...p, balanceAfter: new Decimal(0) })),
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
    // Demo accounts are excluded, so virtual funds can never move into a real account.
    db.account.findFirst({
      where: { id: input.fromAccountId, userId: input.userId, archivedAt: null, type: { not: "DEMO" } },
    }),
    db.account.findFirst({
      where: { id: input.toAccountId, userId: input.userId, archivedAt: null, type: { not: "DEMO" } },
    }),
    db.asset.findFirst({ where: { code: input.assetCode, enabled: true, type: "CRYPTO" } }),
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

/** Customer-facing labels an admin can give a credit; the one they pick becomes the user's history heading. */
export const ADMIN_CREDIT_LABELS = ["Deposit", "Transfer received", "Bonus", "Correction"] as const;
export type AdminCreditLabel = (typeof ADMIN_CREDIT_LABELS)[number];
/** Debits (negative amounts) are shown to the customer as a neutral adjustment, or as a correction. */
export const ADMIN_DEBIT_LABEL = "Adjustment";
export const ADMIN_CORRECTION_LABEL = "Correction";
/** Every label the admin form offers. Credits may use any; debits only Adjustment or Correction. */
export const ADMIN_LABELS = [...ADMIN_CREDIT_LABELS, ADMIN_DEBIT_LABEL] as const;

/** Validates the internal (admin-only) reason recorded on an adjustment. */
function internalReason(reason: string | undefined, fallback: string): string {
  if (reason === undefined) return fallback;
  const r = reason.trim();
  if (r.length < 5) throw new LedgerError("Give an internal reason (at least 5 characters).", "INVALID");
  if (r.length > 500) throw new LedgerError("Keep the internal reason under 500 characters.", "INVALID");
  return r;
}

function customerDescription(input: string): string {
  const description = input.trim();
  if (description.length < 3)
    throw new LedgerError("Add a short description of the source (at least 3 characters).", "INVALID");
  if (description.length > 160) throw new LedgerError("Keep the description under 160 characters.", "INVALID");
  return description;
}

/**
 * Manual balance adjustment by staff (e.g. correcting a provider error, or
 * crediting funds received off-platform). It's a normal ADJUSTMENT journal
 * entry against the ADMIN_ADJUSTMENTS system account, for a specific asset, so
 * the funds land in that coin's wallet. It can't overdraw the user (the database
 * rejects it), and it's never a silent edit.
 *
 * `description` is the customer-facing note (where the funds came from).
 * `reason` is the internal note kept on the entry for staff only (it falls back
 * to the description when omitted). `label` is the customer-facing heading.
 */
export async function adjustBalance(input: {
  actorId: string;
  accountId: string;
  assetCode: string;
  /** Signed amount: positive credits the user, negative debits. */
  amount: string;
  /** Customer-facing source note, e.g. "Transfer from external BTC wallet". */
  description: string;
  /** Customer-facing heading: any of ADMIN_LABELS for a credit; Adjustment or Correction for a debit. */
  label?: string;
  /** Internal, staff-only reason. Never shown to the customer. */
  reason?: string;
}) {
  const description = customerDescription(input.description);
  const reason = internalReason(input.reason, description);
  const [account, asset] = await Promise.all([
    db.account.findFirst({ where: { id: input.accountId, type: { not: "DEMO" } } }),
    db.asset.findUnique({ where: { code: input.assetCode } }),
  ]);
  if (!account || !asset) throw new LedgerError("Account or asset not found.", "NOT_FOUND");
  if (asset.type !== "CRYPTO") throw new LedgerError("Balances are held in crypto only.", "INVALID");
  // A leading "+" is accepted: the admin form's placeholder suggests "+25 or -25".
  const clean = input.amount.trim().replace(/^\+(?=\d)/, "");
  if (!/^-?\d+(\.\d+)?$/.test(clean))
    throw new LedgerError("Enter a signed amount, e.g. +25 or -25.", "INVALID_AMOUNT");
  const amount = new Decimal(clean);
  if (amount.isZero() || amount.decimalPlaces() > asset.decimals)
    throw new LedgerError(`Use a non-zero amount with at most ${asset.decimals} decimals.`, "INVALID_AMOUNT");

  // Debits read as a neutral "Adjustment" (or "Correction"); credits use the admin's chosen label (default Deposit).
  const customerLabel = amount.isNegative()
    ? input.label === ADMIN_CORRECTION_LABEL
      ? ADMIN_CORRECTION_LABEL
      : ADMIN_DEBIT_LABEL
    : (ADMIN_LABELS as readonly string[]).includes(input.label ?? "")
      ? (input.label as string)
      : "Deposit";

  try {
    return await db.$transaction(async (tx) => {
      const user = await ledgerAccountFor(tx, account.id, asset.code);
      const pool = await systemLedgerAccount(tx, "ADMIN_ADJUSTMENTS", asset.code, true);
      return postEntry(tx, {
        type: "ADJUSTMENT",
        description,
        userId: account.userId,
        reason,
        metadata: { actorId: input.actorId, accountId: account.id, customerLabel },
        postings: [
          { ledgerAccountId: user.id, assetCode: asset.code, amount },
          { ledgerAccountId: pool.id, assetCode: asset.code, amount: amount.negated() },
        ],
      });
    }, TX_OPTIONS);
  } catch (err) {
    mapLedgerError(err);
  }
}

/**
 * Post a correcting entry that exactly reverses an earlier admin adjustment.
 * The ledger is append-only, so the original stays in the history and the
 * correction sits beside it (customer sees it as "Correction"). Each adjustment
 * can be corrected once (enforced by the idempotency key), and a correction
 * can't itself be corrected; post a new adjustment instead.
 */
export async function correctAdjustment(input: {
  actorId: string;
  entryId: string;
  /** Customer-facing note, e.g. "Reverses the bonus credited in error". */
  description: string;
  /** Internal, staff-only reason. */
  reason: string;
}) {
  const description = customerDescription(input.description);
  const reason = internalReason(input.reason, "");
  const original = await db.journalEntry.findUnique({
    where: { id: input.entryId },
    include: { postings: { include: { ledgerAccount: { select: { accountId: true } } } } },
  });
  if (!original || original.type !== "ADJUSTMENT") throw new LedgerError("Adjustment not found.", "NOT_FOUND");
  const meta = (original.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.correctsEntryId === "string")
    throw new LedgerError("A correction can't be corrected. Post a new adjustment instead.", "INVALID");
  const userLeg = original.postings.find((p) => p.ledgerAccount.accountId);
  if (!userLeg) throw new LedgerError("Adjustment not found.", "NOT_FOUND");
  const accountId = userLeg.ledgerAccount.accountId!;
  const amount = userLeg.amount.negated();

  try {
    return await db.$transaction(async (tx) => {
      const user = await ledgerAccountFor(tx, accountId, userLeg.assetCode);
      const pool = await systemLedgerAccount(tx, "ADMIN_ADJUSTMENTS", userLeg.assetCode, true);
      return postEntry(tx, {
        type: "ADJUSTMENT",
        description,
        userId: original.userId,
        reason,
        idempotencyKey: `correction:${original.id}`,
        metadata: {
          actorId: input.actorId,
          accountId,
          customerLabel: ADMIN_CORRECTION_LABEL,
          correctsEntryId: original.id,
        },
        postings: [
          { ledgerAccountId: user.id, assetCode: userLeg.assetCode, amount },
          { ledgerAccountId: pool.id, assetCode: userLeg.assetCode, amount: amount.negated() },
        ],
      });
    }, TX_OPTIONS);
  } catch (err) {
    try {
      mapLedgerError(err);
    } catch (mapped) {
      if (mapped instanceof LedgerError && mapped.code === "DUPLICATE")
        throw new LedgerError("This adjustment has already been corrected.", "DUPLICATE");
      throw mapped;
    }
  }
}

/** All non-zero balances for a user, per account and asset. */
export async function userHoldings(userId: string) {
  const rows = await db.ledgerAccount.findMany({
    // Demo balances are virtual and never count toward real totals.
    where: { account: { userId, archivedAt: null, type: { not: "DEMO" } }, balance: { not: 0 } },
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
    // Real-account activity only (demo trades are shown on the Trade page).
    where: { userId, postings: { some: { ledgerAccount: { account: { type: { not: "DEMO" } } } } } },
    orderBy: { createdAt: "desc" },
    take,
    include: { postings: { include: { ledgerAccount: { include: { account: { select: { name: true } } } } } } },
  });
}
