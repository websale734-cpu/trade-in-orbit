"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/dal";
import { RESEND_COOLDOWN_SECONDS, sendCode, usableCode } from "@/server/auth/codes";
import { logSecurityEvent } from "@/server/auth/security-log";
import { LedgerError } from "@/server/ledger";
import { prepareWithdrawal, requestWithdrawal, type Destination } from "@/server/withdrawals";
import { PriceUnavailableError } from "@/lib/market/price";
import type { FormState } from "@/components/ui/form";

export type WithdrawState = FormState & { done?: string };

/** What the confirmation screen shows, plus every field to send again with the codes. */
export type WithdrawReview = {
  /** Unique per review, so each confirmation screen starts fresh. */
  id: string;
  values: Record<string, string>;
  accountName: string;
  assetCode: string;
  amount: string;
  fee: string;
  total: string;
  destination: [string, string][];
  scheduledFor: string | null;
};
export type ReviewState = FormState & { review?: WithdrawReview };

function fail(err: unknown): FormState {
  if (err instanceof LedgerError || err instanceof PriceUnavailableError) return { error: err.message };
  console.error("[withdraw]", err);
  return { error: "The withdrawal couldn't be requested. No funds were moved." };
}

/** Email a one-time code. The confirmation screen calls this as soon as it opens. */
export async function sendWithdrawalCode(): Promise<FormState> {
  const { user } = await requireUser();
  const r = await sendCode(user.id, "WITHDRAWAL_CONFIRM", user.email).catch(() => ({
    ok: false as const,
    error: "Couldn't send the email.",
    retryAfterSeconds: undefined,
  }));
  if (r.ok) return { message: `We emailed a 6-digit code to ${user.email}.` };
  // Still in the resend cooldown: the code sent moments ago still works.
  if (
    r.retryAfterSeconds &&
    r.retryAfterSeconds <= RESEND_COOLDOWN_SECONDS &&
    (await usableCode(user.id, "WITHDRAWAL_CONFIRM"))
  )
    return {
      message: `We emailed a 6-digit code to ${user.email}. Didn't get it? You can resend in ${r.retryAfterSeconds}s.`,
    };
  return { error: r.error };
}

const FIELDS = [
  "method",
  "accountId",
  "assetCode",
  "amount",
  "holder",
  "bankName",
  "account",
  "provider",
  "phone",
  "last4",
  "address",
  "scheduledFor",
];

const base = z.object({
  method: z.enum(["BANK", "CARD", "MOBILE_MONEY", "CRYPTO"]),
  accountId: z.string().min(1),
  assetCode: z.string().regex(/^[A-Z]{2,6}$/),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Enter a valid amount."),
  scheduledFor: z.string().optional(),
});

/**
 * Read the form fields. Destination details are taken exactly as typed, even
 * blank or invalid: the admin reviews them before approving. Returns the
 * request, or an error to show.
 */
function parseRequest(fd: FormData) {
  const raw = Object.fromEntries(fd);
  // Echo the fields back so a failed attempt (or going back from confirmation) doesn't wipe them.
  const values = Object.fromEntries(FIELDS.map((k) => [k, String(raw[k] ?? "").trim()]));
  const parsed = base.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const d = parsed.data;

  let destination: Destination;
  const s = (k: string) => values[k];
  if (d.method === "BANK") {
    destination = {
      kind: "BANK",
      holder: s("holder"),
      bankName: s("bankName"),
      account: s("account").replace(/\s/g, ""),
    };
  } else if (d.method === "MOBILE_MONEY") {
    destination = { kind: "MOBILE_MONEY", provider: s("provider"), phone: s("phone").replace(/[\s-]/g, "") };
  } else if (d.method === "CARD") {
    destination = { kind: "CARD", last4: s("last4") };
  } else {
    destination = { kind: "CRYPTO", address: s("address") };
  }

  // An unreadable date just means "not scheduled".
  const date = d.scheduledFor ? new Date(`${d.scheduledFor}T09:00:00Z`) : null;
  const scheduledFor = date && !Number.isNaN(date.getTime()) ? date : null;

  return { request: { ...d, destination, scheduledFor }, values };
}

function describe(d: Destination): [string, string][] {
  switch (d.kind) {
    case "BANK":
      return [
        ["Account holder", d.holder],
        ["Bank", d.bankName],
        ["Account number / IBAN", d.account],
      ];
    case "MOBILE_MONEY":
      return [
        ["Provider", d.provider],
        ["Mobile number", d.phone],
      ];
    case "CARD":
      return [["Card", d.last4 ? `Ending in ${d.last4}` : ""]];
    case "CRYPTO":
      return [["Wallet address", d.address]];
  }
}

/** Step 1: check the details and show the confirmation screen. Nothing is held yet. */
export async function reviewWithdrawal(_prev: ReviewState | undefined, fd: FormData): Promise<ReviewState> {
  const { user } = await requireUser();
  const p = parseRequest(fd);
  if (!p.request) return { error: p.error, values: p.values };
  try {
    const r = await prepareWithdrawal({ user, ...p.request });
    return {
      values: p.values,
      review: {
        id: randomUUID(),
        values: p.values,
        accountName: r.account.name,
        assetCode: r.asset.code,
        amount: r.amount.toString(),
        fee: r.fee.toString(),
        total: r.total.toString(),
        destination: describe(p.request.destination),
        scheduledFor: r.scheduled?.toISOString() ?? null,
      },
    };
  } catch (err) {
    return { ...fail(err), values: p.values };
  }
}

/** Step 2: check the codes, hold the funds and queue the withdrawal for approval. */
export async function submitWithdrawal(_prev: WithdrawState | undefined, fd: FormData): Promise<WithdrawState> {
  const { user } = await requireUser();
  const p = parseRequest(fd);
  if (!p.request) return { error: p.error };
  const emailCode = String(fd.get("emailCode") ?? "").replace(/\s/g, "");
  const totpCode = String(fd.get("totpCode") ?? "").replace(/\s/g, "");
  if (user.totpSecretEnc && !/^\d{6}$/.test(totpCode))
    return { error: "Enter the 6-digit code from your authenticator app." };
  if (!/^\d{6}$/.test(emailCode)) return { error: "Enter the 6-digit code we emailed you." };

  try {
    const w = await requestWithdrawal({ user, ...p.request, emailCode, totpCode });
    await logSecurityEvent("WITHDRAWAL_REQUESTED", user.id, { withdrawalId: w!.id });
    revalidatePath("/withdraw");
    revalidatePath("/dashboard");
    return {
      message: p.request.scheduledFor
        ? "Withdrawal scheduled. Funds are reserved until then, and it will then wait for approval."
        : "Withdrawal requested. It's pending approval, and the amount is held from your balance.",
      done: w!.id,
    };
  } catch (err) {
    return fail(err);
  }
}
