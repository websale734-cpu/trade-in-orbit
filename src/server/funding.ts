import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { Decimal, LedgerError, postEntry, systemLedgerAccount } from "./ledger";
import { notify } from "./notify/notifications";
import { getLivePrice } from "@/lib/market/price";
import { FIAT_METHODS, NETWORK_FEES } from "@/config/funding";
import { getSettings } from "./settings";
import { siteConfig } from "@/config/site";
import { Prisma, type PaymentMethod, type User } from "@/generated/prisma/client";

/**
 * Deposits.
 *
 * A deposit is recorded as PENDING and credits nothing until the payment
 * provider (webhook) or an admin confirms it. Confirmation posts one balanced
 * entry: EXTERNAL clearing -> user (net of fee) + FEES.
 *
 * Providers:
 *   - CARD: Stripe Checkout when STRIPE_SECRET_KEY is set (confirmed by webhook)
 *   - BANK, MOBILE_MONEY, CRYPTO: provider integrations plug in here; until one
 *     is configured they run in SANDBOX mode outside production only. Sandbox
 *     deposits and addresses are labelled everywhere and never move real money.
 */
const TX = { timeout: 20_000, maxWait: 10_000 } as const;
const isProd = process.env.NODE_ENV === "production";

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Is a method usable, and is it in sandbox mode? */
export function methodMode(method: PaymentMethod): "live" | "sandbox" | "unavailable" {
  if (method === "CARD" && stripeConfigured()) return "live";
  return isProd ? "unavailable" : "sandbox";
}

export async function depositFee(method: PaymentMethod, amount: Decimal, decimals: number): Promise<Decimal> {
  const { fees } = await getSettings();
  return amount.mul(fees.depositBps[method]).div(10_000).toDecimalPlaces(decimals, Prisma.Decimal.ROUND_UP);
}

/** USD value of a user's deposits or withdrawals in the last 24 h (for limits). */
async function usdVolume24h(userId: string, kind: "deposit" | "withdrawal"): Promise<number> {
  const since = new Date(Date.now() - 24 * 3_600_000);
  const rows =
    kind === "deposit"
      ? await db.deposit.findMany({
          where: { userId, createdAt: { gte: since }, status: { in: ["PENDING", "COMPLETED"] } },
        })
      : await db.withdrawal.findMany({ where: { userId, createdAt: { gte: since }, status: { not: "REJECTED" } } });
  let total = 0;
  for (const r of rows) total += Number(r.amount) * Number(await getLivePrice(r.assetCode).catch(() => new Decimal(0)));
  return total;
}

export async function limitsFor(user: Pick<User, "id" | "kycLevel">) {
  const all = (await getSettings()).limits;
  const limits = all[String(user.kycLevel)] ?? all["0"] ?? { depositDaily: 0, withdrawDaily: 0, minDeposit: 0 };
  const [dep, wd] = await Promise.all([usdVolume24h(user.id, "deposit"), usdVolume24h(user.id, "withdrawal")]);
  return {
    ...limits,
    depositRemaining: Math.max(0, limits.depositDaily - dep),
    withdrawRemaining: Math.max(0, limits.withdrawDaily - wd),
  };
}

function newReference() {
  // Human-friendly, unambiguous (no 0/O/1/I).
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  return "ORB-" + [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export async function createDeposit(input: {
  user: User;
  method: PaymentMethod;
  assetCode: string;
  amount: string;
  accountId: string;
}) {
  const { user, method } = input;
  if (user.kycStatus !== "APPROVED") throw new LedgerError("Verify your identity before depositing.", "INVALID");
  const mode = methodMode(method);
  if (mode === "unavailable") throw new LedgerError("This payment method isn't available yet.", "INVALID");

  const asset = await db.asset.findFirst({ where: { code: input.assetCode, enabled: true } });
  if (!asset) throw new LedgerError("Unsupported asset.", "NOT_FOUND");
  if (FIAT_METHODS.includes(method) !== (asset.type === "FIAT"))
    throw new LedgerError("This method can't be used for that asset.", "INVALID");
  const account = await db.account.findFirst({
    where: { id: input.accountId, userId: user.id, type: { not: "DEMO" } },
  });
  if (!account) throw new LedgerError("Account not found.", "NOT_FOUND");

  const amount = new Decimal(input.amount.replace(/,/g, ""));
  if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > asset.decimals)
    throw new LedgerError(`Enter a valid amount (up to ${asset.decimals} decimal places).`, "INVALID_AMOUNT");

  const limits = await limitsFor(user);
  const usdValue = amount.mul(await getLivePrice(asset.code)).toNumber();
  if (usdValue < limits.minDeposit)
    throw new LedgerError(`The minimum deposit is $${limits.minDeposit}.`, "INVALID_AMOUNT");
  if (usdValue > limits.depositRemaining)
    throw new LedgerError(
      `This exceeds your 24-hour deposit limit ($${limits.depositRemaining.toFixed(2)} remaining).`,
      "INVALID_AMOUNT",
    );

  const fee = await depositFee(method, amount, asset.decimals);
  const deposit = await db.deposit.create({
    data: {
      userId: user.id,
      accountId: account.id,
      method,
      assetCode: asset.code,
      amount,
      fee,
      reference: newReference(),
      sandbox: mode === "sandbox",
    },
  });

  let checkoutUrl: string | null = null;
  if (method === "CARD" && mode === "live")
    checkoutUrl = await createStripeCheckout(deposit.id, deposit.reference, amount, user.email);
  return { deposit, checkoutUrl };
}

/** Credit a pending deposit exactly once (webhook retries and double clicks are harmless). */
export async function completeDeposit(depositId: string, providerRef?: string) {
  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.deposit.updateMany({
      where: { id: depositId, status: "PENDING" },
      data: { status: "COMPLETED", completedAt: new Date(), ...(providerRef ? { providerRef } : {}) },
    });
    if (claimed.count !== 1) return null;
    const d = await tx.deposit.findUniqueOrThrow({ where: { id: depositId } });
    const external = await systemLedgerAccount(
      tx,
      d.sandbox ? "SANDBOX_EXTERNAL" : "EXTERNAL_CLEARING",
      d.assetCode,
      true,
    );
    const fees = await systemLedgerAccount(tx, "FEES", d.assetCode);
    const user = await tx.ledgerAccount.upsert({
      where: { accountId_assetCode: { accountId: d.accountId, assetCode: d.assetCode } },
      update: {},
      create: { accountId: d.accountId, assetCode: d.assetCode },
    });
    const entry = await postEntry(tx, {
      type: "DEPOSIT",
      description: `${d.method.replace("_", " ").toLowerCase()} deposit ${d.reference}${d.sandbox ? " (sandbox)" : ""}`,
      userId: d.userId,
      idempotencyKey: `deposit:${d.id}`,
      metadata: { depositId: d.id, sandbox: d.sandbox },
      postings: [
        { ledgerAccountId: external.id, assetCode: d.assetCode, amount: d.amount.negated() },
        { ledgerAccountId: user.id, assetCode: d.assetCode, amount: d.amount.minus(d.fee) },
        { ledgerAccountId: fees.id, assetCode: d.assetCode, amount: d.fee },
      ],
    });
    await tx.deposit.update({ where: { id: d.id }, data: { entryId: entry.id } });
    return d;
  }, TX);
  if (result) {
    await notify(result.userId, {
      type: "ACCOUNT",
      title: "Deposit received",
      body: `${result.amount.minus(result.fee)} ${result.assetCode} has been credited to your account.`,
      link: "/deposit",
    }).catch(() => {});
  }
  return result;
}

export async function failDeposit(depositId: string, reason: string) {
  const { count } = await db.deposit.updateMany({
    where: { id: depositId, status: "PENDING" },
    data: { status: "FAILED", failureReason: reason },
  });
  return count === 1;
}

// ---------------------------------------------------------------------------
// Crypto deposit addresses
// ---------------------------------------------------------------------------

/**
 * The user's deposit address for a coin. Real addresses come from the custody
 * provider (not yet connected); until then a clearly-labelled SANDBOX address
 * is derived for testing, and nothing is shown in production.
 */
export async function getDepositAddress(userId: string, assetCode: string) {
  const existing = await db.depositAddress.findUnique({ where: { userId_assetCode: { userId, assetCode } } });
  if (existing) return existing;
  if (isProd) return null;
  const network = NETWORK_FEES[assetCode]?.network ?? assetCode;
  const h = createHash("sha256").update(`sandbox:${userId}:${assetCode}`).digest("hex");
  const address = `sandbox_${assetCode.toLowerCase()}_${h.slice(0, 32)}`;
  return db.depositAddress.create({ data: { userId, assetCode, network, address, sandbox: true } });
}

// ---------------------------------------------------------------------------
// Stripe Checkout (card deposits)
// ---------------------------------------------------------------------------

async function createStripeCheckout(
  depositId: string,
  reference: string,
  amount: Decimal,
  email: string,
): Promise<string> {
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": amount.mul(100).toFixed(0),
    "line_items[0][price_data][product_data][name]": `Orbtrade deposit ${reference}`,
    customer_email: email,
    client_reference_id: depositId,
    "metadata[depositId]": depositId,
    success_url: `${siteConfig.url}/deposit?status=processing`,
    cancel_url: `${siteConfig.url}/deposit?status=cancelled`,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Stripe checkout failed: ${res.status} ${await res.text()}`);
  const session = (await res.json()) as { id: string; url: string };
  await db.deposit.update({ where: { id: depositId }, data: { providerRef: session.id } });
  return session.url;
}
