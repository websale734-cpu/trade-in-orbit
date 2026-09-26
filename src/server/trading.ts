import "server-only";
import { db } from "./db";
import { Decimal, LedgerError, mapLedgerError, postEntry, systemLedgerAccount } from "./ledger";
import { getLivePrice } from "@/lib/market/price";
import { DEMO_STARTING_USD, MAX_SLIPPAGE_BPS } from "@/config/funding";
import { getSettings } from "./settings";

async function tradeFees() {
  return (await getSettings()).fees.tradeBps;
}
import { Prisma, type Account, type OrderSide } from "@/generated/prisma/client";

/**
 * Brokerage trading engine.
 *
 * Orbtrade is the counterparty: trades fill against the BROKER system account,
 * which represents inventory held with liquidity partners (it may go negative
 * in the ledger; treasury rebalances it off-platform). Every trade is one
 * balanced journal entry: the user's two legs, the broker's two legs and the fee.
 *
 * Demo trades use the same engine against separate DEMO_* system accounts and
 * a DEMO account, so virtual money can never mix with real money.
 */

type Tx = Prisma.TransactionClient;
const TX = { timeout: 20_000, maxWait: 10_000 } as const;
const ROUND_DOWN = Prisma.Decimal.ROUND_DOWN;
const ROUND_UP = Prisma.Decimal.ROUND_UP;

const sys = (demo: boolean) => ({
  broker: demo ? "DEMO_BROKER" : "BROKER",
  fees: demo ? "DEMO_FEES" : "FEES",
  escrow: demo ? "DEMO_ORDER_ESCROW" : "ORDER_ESCROW",
});

/** An asset that can be traded now (admins can close a coin's trading pair). */
async function assetInfo(code: string) {
  const a = await db.asset.findFirst({
    where: { code, enabled: true, ...(code === "USD" ? {} : { tradingEnabled: true }) },
  });
  if (!a) throw new LedgerError(`Trading in ${code} is currently unavailable.`, "NOT_FOUND");
  return a;
}

const bps = (n: number) => new Decimal(n).div(10_000);

/** Fail if the server price moved more than MAX_SLIPPAGE_BPS against the price the user saw. */
function checkSlippage(side: OrderSide, expected: string | undefined, actual: Decimal) {
  if (!expected) return;
  const e = new Decimal(expected);
  if (e.lte(0)) return;
  const worse = side === "BUY" ? actual.minus(e).div(e) : e.minus(actual).div(e);
  if (worse.gt(bps(MAX_SLIPPAGE_BPS)))
    throw new LedgerError("The price moved while you were confirming. Review the new quote and try again.", "INVALID");
}

/** The user's account to trade from: a real account they own, or their DEMO account. */
export async function tradingAccount(userId: string, accountId: string | null, demo: boolean): Promise<Account> {
  if (demo) return ensureDemoAccount(userId);
  const acct = accountId
    ? await db.account.findFirst({ where: { id: accountId, userId, archivedAt: null, type: { not: "DEMO" } } })
    : await db.account.findFirst({ where: { userId, isDefault: true } });
  if (!acct) throw new LedgerError("Account not found.", "NOT_FOUND");
  return acct;
}

/** Create (once) and fund the user's demo account with virtual USD. */
export async function ensureDemoAccount(userId: string): Promise<Account> {
  const existing = await db.account.findFirst({ where: { userId, type: "DEMO" } });
  if (existing) return existing;
  return db.$transaction(async (tx) => {
    const acct = await tx.account.create({ data: { userId, name: "Demo", type: "DEMO" } });
    const faucet = await systemLedgerAccount(tx, "DEMO_FAUCET", "USD", true);
    const la = await tx.ledgerAccount.create({ data: { accountId: acct.id, assetCode: "USD" } });
    await postEntry(tx, {
      type: "DEV_SEED",
      description: "Demo trading: virtual starting balance",
      userId,
      idempotencyKey: `demo-funding:${userId}`,
      metadata: { demo: true },
      postings: [
        { ledgerAccountId: faucet.id, assetCode: "USD", amount: new Decimal(DEMO_STARTING_USD).negated() },
        { ledgerAccountId: la.id, assetCode: "USD", amount: new Decimal(DEMO_STARTING_USD) },
      ],
    });
    return acct;
  }, TX);
}

async function la(tx: Tx, accountId: string, assetCode: string) {
  return tx.ledgerAccount.upsert({
    where: { accountId_assetCode: { accountId, assetCode } },
    update: {},
    create: { accountId, assetCode },
  });
}

// ---------------------------------------------------------------------------
// Instant buy / sell (market)
// ---------------------------------------------------------------------------

export type MarketOrderInput = {
  userId: string;
  accountId: string | null;
  demo: boolean;
  side: OrderSide;
  base: string;
  /** BUY: USD to spend (fee included). SELL: quantity of the base asset. */
  amount: string;
  expectedPrice?: string;
  idempotencyKey: string;
};

export async function executeMarketOrder(input: MarketOrderInput) {
  if (input.base === "USD") throw new LedgerError("Choose a crypto asset.", "INVALID");
  const [asset, usd] = await Promise.all([assetInfo(input.base), assetInfo("USD")]);
  const account = await tradingAccount(input.userId, input.accountId, input.demo);
  const price = await getLivePrice(asset.code);
  checkSlippage(input.side, input.expectedPrice, price);
  const feeRate = bps((await tradeFees()).instant);

  const amount = new Decimal(input.amount);
  if (!amount.isFinite() || amount.lte(0))
    throw new LedgerError("Enter an amount greater than zero.", "INVALID_AMOUNT");

  let qty: Decimal, gross: Decimal, fee: Decimal, userUsd: Decimal;
  if (input.side === "BUY") {
    // Spend `amount` USD in total: fee on top of the notional.
    const spend = amount.toDecimalPlaces(usd.decimals, ROUND_DOWN);
    gross = spend.div(feeRate.plus(1)).toDecimalPlaces(usd.decimals, ROUND_DOWN);
    fee = spend.minus(gross);
    qty = gross.div(price).toDecimalPlaces(asset.decimals, ROUND_DOWN);
    if (qty.lte(0)) throw new LedgerError("Amount is too small.", "INVALID_AMOUNT");
    userUsd = spend.negated();
  } else {
    qty = amount.toDecimalPlaces(asset.decimals, ROUND_DOWN);
    gross = qty.mul(price).toDecimalPlaces(usd.decimals, ROUND_DOWN);
    fee = gross.mul(feeRate).toDecimalPlaces(usd.decimals, ROUND_UP);
    if (gross.minus(fee).lte(0)) throw new LedgerError("Amount is too small.", "INVALID_AMOUNT");
    userUsd = gross.minus(fee);
  }

  const s = sys(input.demo);
  try {
    return await db.$transaction(async (tx) => {
      const uBase = await la(tx, account.id, asset.code);
      const uUsd = await la(tx, account.id, "USD");
      const bBase = await systemLedgerAccount(tx, s.broker, asset.code, true);
      const bUsd = await systemLedgerAccount(tx, s.broker, "USD", true);
      const fees = await systemLedgerAccount(tx, s.fees, "USD");
      const sign = input.side === "BUY" ? 1 : -1;
      const entry = await postEntry(tx, {
        type: "TRADE",
        description: `${input.side === "BUY" ? "Bought" : "Sold"} ${qty} ${asset.code} @ ${price.toFixed(2)} USD`,
        userId: input.userId,
        idempotencyKey: `trade:${input.userId}:${input.idempotencyKey}`,
        metadata: { side: input.side, price: price.toString(), fee: fee.toString(), demo: input.demo },
        postings: [
          { ledgerAccountId: uBase.id, assetCode: asset.code, amount: qty.mul(sign) },
          { ledgerAccountId: bBase.id, assetCode: asset.code, amount: qty.mul(-sign) },
          { ledgerAccountId: uUsd.id, assetCode: "USD", amount: userUsd },
          { ledgerAccountId: bUsd.id, assetCode: "USD", amount: gross.mul(sign) },
          { ledgerAccountId: fees.id, assetCode: "USD", amount: fee },
        ],
      });
      const order = await tx.order.create({
        data: {
          userId: input.userId,
          accountId: account.id,
          demo: input.demo,
          side: input.side,
          type: "MARKET",
          baseAsset: asset.code,
          quantity: qty,
          status: "FILLED",
          fillPrice: price,
          fee,
          entryId: entry.id,
          filledAt: new Date(),
        },
      });
      return { order, qty, price, fee, total: userUsd.abs() };
    }, TX);
  } catch (err) {
    mapLedgerError(err);
  }
}

// ---------------------------------------------------------------------------
// Swap (crypto -> crypto)
// ---------------------------------------------------------------------------

export async function executeSwap(input: {
  userId: string;
  accountId: string | null;
  demo: boolean;
  from: string;
  to: string;
  quantity: string;
  expectedRate?: string;
  idempotencyKey: string;
}) {
  if (input.from === input.to) throw new LedgerError("Choose two different assets.", "INVALID");
  const [fromA, toA] = await Promise.all([assetInfo(input.from), assetInfo(input.to)]);
  const account = await tradingAccount(input.userId, input.accountId, input.demo);
  const [pFrom, pTo] = await Promise.all([getLivePrice(fromA.code), getLivePrice(toA.code)]);
  const rate = pFrom.div(pTo);
  // Treat the swap as selling `from` for `to`: a worse (lower) rate triggers the slippage guard.
  checkSlippage("SELL", input.expectedRate, rate);

  const qty = new Decimal(input.quantity).toDecimalPlaces(fromA.decimals, ROUND_DOWN);
  if (qty.lte(0)) throw new LedgerError("Enter an amount greater than zero.", "INVALID_AMOUNT");
  const fee = qty.mul(bps((await tradeFees()).instant)).toDecimalPlaces(fromA.decimals, ROUND_UP);
  const received = qty.minus(fee).mul(rate).toDecimalPlaces(toA.decimals, ROUND_DOWN);
  if (received.lte(0)) throw new LedgerError("Amount is too small.", "INVALID_AMOUNT");

  const s = sys(input.demo);
  try {
    return await db.$transaction(async (tx) => {
      const uFrom = await la(tx, account.id, fromA.code);
      const uTo = await la(tx, account.id, toA.code);
      const bFrom = await systemLedgerAccount(tx, s.broker, fromA.code, true);
      const bTo = await systemLedgerAccount(tx, s.broker, toA.code, true);
      const fees = await systemLedgerAccount(tx, s.fees, fromA.code);
      const entry = await postEntry(tx, {
        type: "TRADE",
        description: `Swapped ${qty} ${fromA.code} for ${received} ${toA.code}`,
        userId: input.userId,
        idempotencyKey: `swap:${input.userId}:${input.idempotencyKey}`,
        metadata: { swap: true, rate: rate.toString(), fee: fee.toString(), demo: input.demo },
        postings: [
          { ledgerAccountId: uFrom.id, assetCode: fromA.code, amount: qty.negated() },
          { ledgerAccountId: bFrom.id, assetCode: fromA.code, amount: qty.minus(fee) },
          { ledgerAccountId: fees.id, assetCode: fromA.code, amount: fee },
          { ledgerAccountId: bTo.id, assetCode: toA.code, amount: received.negated() },
          { ledgerAccountId: uTo.id, assetCode: toA.code, amount: received },
        ],
      });
      return { entryId: entry.id, received, fee, rate };
    }, TX);
  } catch (err) {
    mapLedgerError(err);
  }
}

// ---------------------------------------------------------------------------
// Limit orders
// ---------------------------------------------------------------------------

/**
 * Place a limit order. Funds are moved to escrow immediately (quote + maximum
 * fee for a buy, the base quantity for a sell), so an open order can always
 * settle. It fills at the limit price when the market reaches it.
 */
export async function placeLimitOrder(input: {
  userId: string;
  accountId: string | null;
  demo: boolean;
  side: OrderSide;
  base: string;
  quantity: string;
  limitPrice: string;
}) {
  const [asset, usd] = await Promise.all([assetInfo(input.base), assetInfo("USD")]);
  const account = await tradingAccount(input.userId, input.accountId, input.demo);
  const qty = new Decimal(input.quantity).toDecimalPlaces(asset.decimals, ROUND_DOWN);
  const limit = new Decimal(input.limitPrice).toDecimalPlaces(8, ROUND_DOWN);
  if (qty.lte(0) || limit.lte(0))
    throw new LedgerError("Enter a quantity and a limit price above zero.", "INVALID_AMOUNT");

  const notional = qty.mul(limit).toDecimalPlaces(usd.decimals, ROUND_UP);
  const maxFee = notional.mul(bps((await tradeFees()).maker)).toDecimalPlaces(usd.decimals, ROUND_UP);
  const holdAsset = input.side === "BUY" ? "USD" : asset.code;
  const hold = input.side === "BUY" ? notional.plus(maxFee) : qty;
  const s = sys(input.demo);

  try {
    return await db.$transaction(async (tx) => {
      const user = await la(tx, account.id, holdAsset);
      const escrow = await systemLedgerAccount(tx, s.escrow, holdAsset);
      const entry = await postEntry(tx, {
        type: "TRADE",
        description: `Limit ${input.side.toLowerCase()} ${qty} ${asset.code} @ ${limit} USD placed (funds reserved)`,
        userId: input.userId,
        metadata: { limitOrder: true, demo: input.demo },
        postings: [
          { ledgerAccountId: user.id, assetCode: holdAsset, amount: hold.negated() },
          { ledgerAccountId: escrow.id, assetCode: holdAsset, amount: hold },
        ],
      });
      return tx.order.create({
        data: {
          userId: input.userId,
          accountId: account.id,
          demo: input.demo,
          side: input.side,
          type: "LIMIT",
          baseAsset: asset.code,
          quantity: qty,
          limitPrice: limit,
          escrow: hold,
          entryId: entry.id,
        },
      });
    }, TX);
  } catch (err) {
    mapLedgerError(err);
  }
}

export async function cancelOrder(userId: string, orderId: string) {
  const order = await db.order.findFirst({ where: { id: orderId, userId, status: "OPEN", type: "LIMIT" } });
  if (!order) throw new LedgerError("Order not found or already closed.", "NOT_FOUND");
  const holdAsset = order.side === "BUY" ? "USD" : order.baseAsset;
  const s = sys(order.demo);
  await db.$transaction(async (tx) => {
    // Claim the order first so a concurrent fill/cancel can't also release escrow.
    const claimed = await tx.order.updateMany({
      where: { id: order.id, status: "OPEN" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (claimed.count !== 1) throw new LedgerError("Order already closed.", "INVALID");
    const escrow = await systemLedgerAccount(tx, s.escrow, holdAsset);
    const user = await la(tx, order.accountId, holdAsset);
    await postEntry(tx, {
      type: "TRADE",
      description: `Limit order cancelled: ${order.escrow} ${holdAsset} released`,
      userId,
      metadata: { orderId: order.id, cancel: true },
      postings: [
        { ledgerAccountId: escrow.id, assetCode: holdAsset, amount: order.escrow!.negated() },
        { ledgerAccountId: user.id, assetCode: holdAsset, amount: order.escrow! },
      ],
    });
  }, TX);
}

/**
 * Fill open limit orders whose price has been reached. Safe to run from many
 * places at once (cron, page loads): each order is claimed with a conditional
 * update before it settles.
 */
export async function matchOpenOrders(filter: { userId?: string } = {}): Promise<number> {
  const open = await db.order.findMany({ where: { status: "OPEN", type: "LIMIT", ...filter }, take: 200 });
  let filled = 0;
  for (const order of open) {
    let price: Decimal;
    try {
      price = await getLivePrice(order.baseAsset);
    } catch {
      continue;
    }
    const limit = order.limitPrice!;
    const reached = order.side === "BUY" ? price.lte(limit) : price.gte(limit);
    if (!reached) continue;
    try {
      await settleLimit(order.id, limit);
      filled++;
    } catch (err) {
      console.error("[match] settle failed", order.id, err);
    }
  }
  return filled;
}

async function settleLimit(orderId: string, fillPrice: Decimal) {
  await db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const claimed = await tx.order.updateMany({ where: { id: orderId, status: "OPEN" }, data: { status: "FILLED" } });
    if (claimed.count !== 1) return; // someone else settled or cancelled it

    const s = sys(order.demo);
    const usdDecimals = 2;
    const gross = order.quantity.mul(fillPrice).toDecimalPlaces(usdDecimals, ROUND_DOWN);
    const fee = gross.mul(bps((await tradeFees()).maker)).toDecimalPlaces(usdDecimals, ROUND_UP);
    const uBase = await la(tx, order.accountId, order.baseAsset);
    const uUsd = await la(tx, order.accountId, "USD");
    const bBase = await systemLedgerAccount(tx, s.broker, order.baseAsset, true);
    const bUsd = await systemLedgerAccount(tx, s.broker, "USD", true);
    const fees = await systemLedgerAccount(tx, s.fees, "USD");

    let postings;
    if (order.side === "BUY") {
      const escrow = await systemLedgerAccount(tx, s.escrow, "USD");
      const refund = order.escrow!.minus(gross).minus(fee); // unused part of the reserved fee
      postings = [
        { ledgerAccountId: escrow.id, assetCode: "USD", amount: order.escrow!.negated() },
        { ledgerAccountId: bUsd.id, assetCode: "USD", amount: gross },
        { ledgerAccountId: fees.id, assetCode: "USD", amount: fee },
        ...(refund.gt(0) ? [{ ledgerAccountId: uUsd.id, assetCode: "USD", amount: refund }] : []),
        { ledgerAccountId: bBase.id, assetCode: order.baseAsset, amount: order.quantity.negated() },
        { ledgerAccountId: uBase.id, assetCode: order.baseAsset, amount: order.quantity },
      ];
    } else {
      const escrow = await systemLedgerAccount(tx, s.escrow, order.baseAsset);
      postings = [
        { ledgerAccountId: escrow.id, assetCode: order.baseAsset, amount: order.quantity.negated() },
        { ledgerAccountId: bBase.id, assetCode: order.baseAsset, amount: order.quantity },
        { ledgerAccountId: bUsd.id, assetCode: "USD", amount: gross.negated() },
        { ledgerAccountId: uUsd.id, assetCode: "USD", amount: gross.minus(fee) },
        { ledgerAccountId: fees.id, assetCode: "USD", amount: fee },
      ];
    }
    const entry = await postEntry(tx, {
      type: "TRADE",
      description: `Limit ${order.side.toLowerCase()} filled: ${order.quantity} ${order.baseAsset} @ ${fillPrice} USD`,
      userId: order.userId,
      metadata: { orderId: order.id, fill: true, demo: order.demo },
      postings,
    });
    await tx.order.update({
      where: { id: orderId },
      data: { fillPrice, fee, filledAt: new Date(), entryId: entry.id },
    });
  }, TX);
}
