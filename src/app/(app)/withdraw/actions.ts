"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/dal";
import { sendCode } from "@/server/auth/codes";
import { logSecurityEvent } from "@/server/auth/security-log";
import { LedgerError } from "@/server/ledger";
import {
  addWithdrawalAddress,
  confirmWithdrawalAddress,
  requestWithdrawal,
  type Destination,
} from "@/server/withdrawals";
import { PriceUnavailableError } from "@/lib/market/price";
import type { FormState } from "@/components/ui/form";

export type WithdrawState = FormState & { done?: string };

function fail(err: unknown): FormState {
  if (err instanceof LedgerError || err instanceof PriceUnavailableError) return { error: err.message };
  console.error("[withdraw]", err);
  return { error: "The withdrawal couldn't be requested. No funds were moved." };
}

/** Email a one-time code (used when the user hasn't enabled an authenticator app). */
export async function sendWithdrawalCode(): Promise<FormState> {
  const { user } = await requireUser();
  const r = await sendCode(user.id, "WITHDRAWAL_CONFIRM", user.email).catch(() => ({
    ok: false as const,
    error: "Couldn't send the email.",
  }));
  return r.ok ? { message: "We emailed you a 6-digit code." } : { error: r.error };
}

const base = z.object({
  method: z.enum(["BANK", "CARD", "MOBILE_MONEY", "CRYPTO"]),
  accountId: z.string().min(1),
  assetCode: z.string().regex(/^[A-Z]{2,6}$/),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Enter a valid amount."),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit confirmation code."),
  scheduledFor: z.string().optional(),
});

export async function submitWithdrawal(_prev: WithdrawState | undefined, fd: FormData): Promise<WithdrawState> {
  const { user } = await requireUser();
  const raw = Object.fromEntries(fd);
  // Echo destination fields back so a failed attempt (e.g. a wrong code) doesn't wipe them.
  const values = Object.fromEntries(
    ["holder", "bankName", "account", "provider", "phone", "last4", "scheduledFor"].map((k) => [
      k,
      String(raw[k] ?? ""),
    ]),
  );
  const parsed = base.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  const d = parsed.data;

  let destination: Destination;
  const s = (k: string) => String(raw[k] ?? "").trim();
  if (d.method === "BANK") {
    if (s("holder").length < 2 || s("bankName").length < 2 || !/^[A-Z0-9 ]{6,34}$/i.test(s("account")))
      return { error: "Enter the account holder, bank name and a valid account number or IBAN.", values };
    destination = {
      kind: "BANK",
      holder: s("holder"),
      bankName: s("bankName"),
      account: s("account").replace(/\s/g, ""),
    };
  } else if (d.method === "MOBILE_MONEY") {
    if (!/^\+[1-9]\d{7,14}$/.test(s("phone").replace(/[\s-]/g, "")) || s("provider").length < 2)
      return { error: "Enter the provider and a mobile number with country code.", values };
    destination = { kind: "MOBILE_MONEY", provider: s("provider"), phone: s("phone").replace(/[\s-]/g, "") };
  } else if (d.method === "CARD") {
    if (!/^\d{4}$/.test(s("last4")))
      return { error: "Enter the last 4 digits of the card you deposited with.", values };
    destination = { kind: "CARD", last4: s("last4") };
  } else {
    if (!s("addressId")) return { error: "Choose a confirmed address from your address book.", values };
    destination = { kind: "CRYPTO", addressId: s("addressId") };
  }

  const scheduledFor = d.scheduledFor ? new Date(`${d.scheduledFor}T09:00:00Z`) : null;
  if (scheduledFor && (Number.isNaN(scheduledFor.getTime()) || scheduledFor.getTime() > Date.now() + 90 * 86_400_000))
    return { error: "Choose a date within the next 90 days.", values };

  try {
    const w = await requestWithdrawal({ user, ...d, destination, confirmationCode: d.code, scheduledFor });
    await logSecurityEvent("WITHDRAWAL_REQUESTED", user.id, { withdrawalId: w!.id });
    revalidatePath("/withdraw");
    revalidatePath("/dashboard");
    return {
      message: scheduledFor
        ? "Withdrawal scheduled. Funds are reserved until then."
        : "Withdrawal requested. We'll notify you as it progresses.",
      done: w!.id,
    };
  } catch (err) {
    return { ...fail(err), values };
  }
}

export type AddressState = FormState & { pendingId?: string };

export async function addAddress(_prev: AddressState | undefined, fd: FormData): Promise<AddressState> {
  const { user } = await requireUser();
  const parsed = z
    .object({
      assetCode: z.string().regex(/^[A-Z]{2,6}$/),
      label: z.string().trim().min(1).max(40),
      address: z.string().trim().min(10).max(128),
    })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Enter a label and the full address." };
  try {
    const saved = await addWithdrawalAddress(user, parsed.data.assetCode, parsed.data.label, parsed.data.address);
    if (saved.confirmedAt) return { message: "This address is already in your address book." };
    const sent = await sendCode(user.id, "ADDRESS_CONFIRM", user.email);
    if (!sent.ok) return { error: sent.error, pendingId: saved.id };
    return { message: "We emailed you a code to confirm this address.", pendingId: saved.id };
  } catch (err) {
    return fail(err);
  }
}

export async function confirmAddress(_prev: AddressState | undefined, fd: FormData): Promise<AddressState> {
  const { user } = await requireUser();
  const id = String(fd.get("addressId") ?? "");
  try {
    await confirmWithdrawalAddress(user, id, String(fd.get("code") ?? ""));
    revalidatePath("/withdraw");
    return { message: "Address confirmed and added to your address book." };
  } catch (err) {
    return { ...fail(err), pendingId: id };
  }
}
