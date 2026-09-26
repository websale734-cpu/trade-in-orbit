import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { db } from "./db";
import { notify } from "./notify/notifications";
import { sendEmail, simpleNoticeEmail } from "./notify/email";
import type { User } from "@/generated/prisma/client";

/**
 * Monthly account statements, the tax transaction report and history exports.
 * Everything is derived from the ledger (journal entries + postings), so it
 * always agrees with balances. Demo activity is excluded.
 */

export function isMonth(v: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

export function previousMonth(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Months (newest first) from the user's first activity to last month. */
export async function statementMonths(userId: string): Promise<string[]> {
  const first = await db.journalEntry.findFirst({ where: { userId }, orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  const start = first?.createdAt ?? new Date();
  const out: string[] = [];
  const cur = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const stop = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cur >= stop && out.length < 36) {
    out.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`);
    cur.setUTCMonth(cur.getUTCMonth() - 1);
  }
  return out;
}

/** Signed per-asset sum of the user's real-account postings in a time window. */
async function balancesAt(userId: string, before: Date) {
  const rows = await db.$queryRaw<{ asset_code: string; total: string }[]>`
    SELECT p.asset_code, sum(p.amount)::text AS total
    FROM postings p
    JOIN ledger_accounts la ON la.id = p.ledger_account_id
    JOIN accounts a ON a.id = la.account_id
    WHERE a.user_id = ${userId} AND a.type <> 'DEMO' AND p.created_at < ${before}
    GROUP BY p.asset_code ORDER BY p.asset_code`;
  return rows.filter((r) => Number(r.total) !== 0);
}

/** Journal entries touching the user's real accounts, with their net effect per asset. */
export async function userEntries(userId: string, where: { from?: Date; to?: Date; type?: string; q?: string } = {}, take = 500, skip = 0) {
  const entries = await db.journalEntry.findMany({
    where: {
      userId,
      createdAt: { gte: where.from, lt: where.to },
      ...(where.type ? { type: where.type as never } : {}),
      ...(where.q ? { description: { contains: where.q, mode: "insensitive" } } : {}),
      postings: { some: { ledgerAccount: { account: { userId, type: { not: "DEMO" } } } } },
    },
    orderBy: { createdAt: "desc" },
    take,
    skip,
    include: { postings: { include: { ledgerAccount: { select: { account: { select: { userId: true, type: true, name: true } } } } } } },
  });
  return entries.map((e) => {
    const mine = e.postings.filter((p) => p.ledgerAccount.account?.userId === userId && p.ledgerAccount.account.type !== "DEMO");
    const net = new Map<string, number>();
    for (const p of mine) net.set(p.assetCode, (net.get(p.assetCode) ?? 0) + Number(p.amount));
    return {
      id: e.id,
      type: e.type,
      description: e.description,
      createdAt: e.createdAt,
      metadata: e.metadata as Record<string, unknown> | null,
      // Internal transfers net to zero overall; show the moved amount instead.
      changes: [...net.entries()].filter(([, v]) => v !== 0 || e.type === "TRANSFER").map(([asset, amount]) => ({ asset, amount })),
      accounts: [...new Set(mine.map((p) => p.ledgerAccount.account!.name))],
    };
  });
}

// ---------------------------------------------------------------------------
// PDF helpers
// ---------------------------------------------------------------------------

type Pdf = { doc: PDFDocument; page: PDFPage; font: PDFFont; bold: PDFFont; y: number };
const W = 595;
const H = 842;
const M = 48;

async function newPdf(title: string, subtitle: string): Promise<Pdf> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(title);
  doc.setProducer("Orbtrade");
  const pdf = { doc, page: doc.addPage([W, H]), font, bold, y: H - M };
  pdf.page.drawText("Orbtrade", { x: M, y: pdf.y, size: 18, font: bold, color: rgb(0.43, 0.16, 0.85) });
  pdf.y -= 26;
  pdf.page.drawText(title, { x: M, y: pdf.y, size: 13, font: bold });
  pdf.y -= 16;
  pdf.page.drawText(subtitle, { x: M, y: pdf.y, size: 9, font, color: rgb(0.35, 0.35, 0.4) });
  pdf.y -= 24;
  return pdf;
}

/** Helvetica only covers WinAnsi; replace anything else so generation never fails. */
const safe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?");

function line(pdf: Pdf, cols: { text: string; x: number; bold?: boolean; right?: boolean; size?: number }[], gap = 14) {
  if (pdf.y < M + 30) {
    pdf.page = pdf.doc.addPage([W, H]);
    pdf.y = H - M;
  }
  for (const c of cols) {
    const size = c.size ?? 8.5;
    const f = c.bold ? pdf.bold : pdf.font;
    const text = safe(c.text);
    const x = c.right ? c.x - f.widthOfTextAtSize(text, size) : c.x;
    pdf.page.drawText(text, { x, y: pdf.y, size, font: f });
  }
  pdf.y -= gap;
}

const fmtQty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 8 });

// ---------------------------------------------------------------------------
// Monthly statement
// ---------------------------------------------------------------------------

export async function statementPdf(user: Pick<User, "id" | "name" | "email">, month: string): Promise<Uint8Array> {
  const { start, end } = monthRange(month);
  const [opening, closing, entries] = await Promise.all([
    balancesAt(user.id, start),
    balancesAt(user.id, end),
    userEntries(user.id, { from: start, to: end }, 2000),
  ]);
  const label = start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const pdf = await newPdf(`Account statement: ${label}`, `${user.name} · ${user.email} · generated ${new Date().toISOString().slice(0, 10)} (UTC)`);

  line(pdf, [{ text: "Balances", x: M, bold: true, size: 11 }], 16);
  line(pdf, [
    { text: "Asset", x: M, bold: true },
    { text: "Opening", x: 330, bold: true, right: true },
    { text: "Closing", x: W - M, bold: true, right: true },
  ]);
  const assets = [...new Set([...opening.map((r) => r.asset_code), ...closing.map((r) => r.asset_code)])].sort();
  if (!assets.length) line(pdf, [{ text: "No balances.", x: M }]);
  for (const a of assets) {
    line(pdf, [
      { text: a, x: M },
      { text: fmtQty(Number(opening.find((r) => r.asset_code === a)?.total ?? 0)), x: 330, right: true },
      { text: fmtQty(Number(closing.find((r) => r.asset_code === a)?.total ?? 0)), x: W - M, right: true },
    ]);
  }
  pdf.y -= 10;
  line(pdf, [{ text: `Transactions (${entries.length})`, x: M, bold: true, size: 11 }], 16);
  line(pdf, [
    { text: "Date (UTC)", x: M, bold: true },
    { text: "Type", x: 120, bold: true },
    { text: "Description", x: 195, bold: true },
    { text: "Amount", x: W - M, bold: true, right: true },
  ]);
  for (const e of [...entries].reverse()) {
    const amounts = e.changes.map((c) => `${c.amount > 0 ? "+" : ""}${fmtQty(c.amount)} ${c.asset}`).join("  ");
    line(pdf, [
      { text: e.createdAt.toISOString().slice(0, 16).replace("T", " "), x: M },
      { text: e.type, x: 120 },
      { text: e.description.slice(0, 48), x: 195 },
      { text: amounts.slice(0, 40), x: W - M, right: true },
    ]);
  }
  pdf.y -= 16;
  line(pdf, [{ text: "Balances are in asset units. Demo activity is excluded. Questions? Contact support from your account.", x: M, size: 7.5 }]);
  return pdf.doc.save();
}

// ---------------------------------------------------------------------------
// Tax transaction report
// ---------------------------------------------------------------------------

export type TaxRow = {
  date: string;
  type: "BUY" | "SELL" | "SWAP_OUT" | "SWAP_IN" | "DEPOSIT" | "WITHDRAWAL" | "REWARD" | "ADJUSTMENT";
  asset: string;
  quantity: number;
  priceUsd: number | null;
  valueUsd: number | null;
  feeUsd: number | null;
  reference: string;
};

/** Every acquisition and disposal in a calendar year, valued in USD at execution. */
export async function taxRows(userId: string, year: number): Promise<TaxRow[]> {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year + 1, 0, 1));
  const [orders, entries, deposits, withdrawals] = await Promise.all([
    db.order.findMany({ where: { userId, demo: false, status: "FILLED", filledAt: { gte: from, lt: to } }, orderBy: { filledAt: "asc" } }),
    userEntries(userId, { from, to }, 5000),
    db.deposit.findMany({ where: { userId, status: "COMPLETED", completedAt: { gte: from, lt: to } } }),
    db.withdrawal.findMany({ where: { userId, status: "COMPLETED", completedAt: { gte: from, lt: to } } }),
  ]);
  const rows: TaxRow[] = [];
  for (const o of orders) {
    const qty = Number(o.quantity);
    const price = Number(o.fillPrice);
    rows.push({ date: o.filledAt!.toISOString(), type: o.side === "BUY" ? "BUY" : "SELL", asset: o.baseAsset, quantity: qty, priceUsd: price, valueUsd: qty * price, feeUsd: Number(o.fee ?? 0), reference: o.id });
  }
  for (const e of entries) {
    if (e.type === "TRADE" && e.metadata?.swap) {
      const out = e.changes.find((c) => c.amount < 0);
      const inn = e.changes.find((c) => c.amount > 0);
      const pf = Number(e.metadata.priceFromUsd ?? NaN);
      const pt = Number(e.metadata.priceToUsd ?? NaN);
      if (out) rows.push({ date: e.createdAt.toISOString(), type: "SWAP_OUT", asset: out.asset, quantity: -out.amount, priceUsd: Number.isNaN(pf) ? null : pf, valueUsd: Number.isNaN(pf) ? null : -out.amount * pf, feeUsd: null, reference: e.id });
      if (inn) rows.push({ date: e.createdAt.toISOString(), type: "SWAP_IN", asset: inn.asset, quantity: inn.amount, priceUsd: Number.isNaN(pt) ? null : pt, valueUsd: Number.isNaN(pt) ? null : inn.amount * pt, feeUsd: null, reference: e.id });
    } else if (e.type === "REWARD" || e.type === "ADJUSTMENT") {
      for (const c of e.changes) rows.push({ date: e.createdAt.toISOString(), type: e.type, asset: c.asset, quantity: c.amount, priceUsd: null, valueUsd: c.asset === "USD" ? c.amount : null, feeUsd: null, reference: e.id });
    }
  }
  for (const d of deposits) rows.push({ date: d.completedAt!.toISOString(), type: "DEPOSIT", asset: d.assetCode, quantity: Number(d.amount), priceUsd: null, valueUsd: d.assetCode === "USD" ? Number(d.amount) : null, feeUsd: d.assetCode === "USD" ? Number(d.fee) : null, reference: d.reference });
  for (const w of withdrawals) rows.push({ date: w.completedAt!.toISOString(), type: "WITHDRAWAL", asset: w.assetCode, quantity: Number(w.amount), priceUsd: null, valueUsd: w.assetCode === "USD" ? Number(w.amount) : null, feeUsd: w.assetCode === "USD" ? Number(w.fee) : null, reference: w.id });
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** CSV with a formula-injection guard (cells starting with = + - @ are prefixed). */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    if (v === null || v === undefined) return "";
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function taxCsv(rows: TaxRow[]): string {
  return toCsv(
    ["date_utc", "type", "asset", "quantity", "price_usd", "value_usd", "fee_usd", "reference"],
    rows.map((r) => [r.date, r.type, r.asset, r.quantity, r.priceUsd, r.valueUsd === null ? null : Number(r.valueUsd.toFixed(2)), r.feeUsd, r.reference]),
  );
}

export async function taxPdf(user: Pick<User, "name" | "email">, year: number, rows: TaxRow[]): Promise<Uint8Array> {
  const pdf = await newPdf(`Tax transaction report: ${year}`, `${user.name} · ${user.email} · for your tax adviser or tax software. Not tax advice.`);
  const sum = (t: TaxRow["type"]) => rows.filter((r) => r.type === t).reduce((s, r) => s + (r.valueUsd ?? 0), 0);
  line(pdf, [{ text: "Summary (USD value at execution)", x: M, bold: true, size: 11 }], 16);
  for (const [label, t] of [["Purchases", "BUY"], ["Sales (disposals)", "SELL"], ["Swaps out (disposals)", "SWAP_OUT"], ["Swaps in (acquisitions)", "SWAP_IN"], ["Rewards received", "REWARD"]] as const)
    line(pdf, [{ text: label, x: M }, { text: `$${sum(t).toLocaleString("en-US", { maximumFractionDigits: 2 })}`, x: 330, right: true }]);
  pdf.y -= 10;
  line(pdf, [
    { text: "Date (UTC)", x: M, bold: true },
    { text: "Type", x: 125, bold: true },
    { text: "Asset", x: 195, bold: true },
    { text: "Quantity", x: 330, bold: true, right: true },
    { text: "Price USD", x: 420, bold: true, right: true },
    { text: "Value USD", x: W - M, bold: true, right: true },
  ]);
  for (const r of rows)
    line(pdf, [
      { text: r.date.slice(0, 16).replace("T", " "), x: M },
      { text: r.type, x: 125 },
      { text: r.asset, x: 195 },
      { text: fmtQty(r.quantity), x: 330, right: true },
      { text: r.priceUsd === null ? "-" : r.priceUsd.toFixed(2), x: 420, right: true },
      { text: r.valueUsd === null ? "-" : r.valueUsd.toFixed(2), x: W - M, right: true },
    ]);
  pdf.y -= 12;
  line(pdf, [{ text: "Cost basis and gains depend on your jurisdiction's rules; use this report with your adviser or tax software.", x: M, size: 7.5 }]);
  return pdf.doc.save();
}

// ---------------------------------------------------------------------------
// Monthly "statement ready" notices
// ---------------------------------------------------------------------------

/**
 * In the first days of each month, tell every customer who had activity last
 * month that their statement is ready (in-app + email with a link, never the
 * PDF itself: statements hold financial data and stay behind login).
 * Idempotent via statement_dispatches; processes up to 200 customers per run.
 */
export async function sendMonthlyStatementNotices(): Promise<number> {
  if (new Date().getUTCDate() > 3) return 0;
  const month = previousMonth();
  const { start, end } = monthRange(month);
  const users = await db.$queryRaw<{ id: string; email: string }[]>`
    SELECT DISTINCT u.id, u.email FROM users u
    JOIN journal_entries je ON je.user_id = u.id
    LEFT JOIN statement_dispatches sd ON sd.user_id = u.id AND sd.month = ${month}
    WHERE je.created_at >= ${start} AND je.created_at < ${end} AND sd.user_id IS NULL AND u.status = 'ACTIVE'
    LIMIT 200`;
  let sent = 0;
  for (const u of users) {
    try {
      await db.statementDispatch.create({ data: { userId: u.id, month } });
    } catch {
      continue; // another run got it
    }
    const label = start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    await notify(u.id, { type: "ACCOUNT", title: `Your ${label} statement is ready`, body: "Download it from History → Statements.", link: "/history?tab=statements" }).catch(() => {});
    await sendEmail(simpleNoticeEmail(u.email, `Your Orbtrade statement for ${label}`, `Your account statement for ${label} is ready to download.`, "/history?tab=statements", "View statements")).catch(() => {});
    sent++;
  }
  return sent;
}
