"use server";

import QRCode from "qrcode";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/dal";
import { LedgerError } from "@/server/ledger";
import { createDeposit, getDepositAddress } from "@/server/funding";
import { PriceUnavailableError } from "@/lib/market/price";
import type { FormState } from "@/components/ui/form";

export type DepositState = FormState & {
  created?: { reference: string; method: string; amount: string; fee: string; sandbox: boolean };
};

const schema = z.object({
  method: z.enum(["BANK", "CARD", "MOBILE_MONEY"]),
  accountId: z.string().min(1),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Enter a valid amount."),
});

export async function startDeposit(_prev: DepositState | undefined, fd: FormData): Promise<DepositState> {
  const { user } = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let checkoutUrl: string | null = null;
  try {
    const r = await createDeposit({ user, ...parsed.data, assetCode: "USD" });
    checkoutUrl = r.checkoutUrl;
    if (!checkoutUrl) {
      revalidatePath("/deposit");
      return {
        created: {
          reference: r.deposit.reference,
          method: r.deposit.method,
          amount: r.deposit.amount.toString(),
          fee: r.deposit.fee.toString(),
          sandbox: r.deposit.sandbox,
        },
      };
    }
  } catch (err) {
    if (err instanceof LedgerError || err instanceof PriceUnavailableError) return { error: err.message };
    console.error("[deposit]", err);
    return { error: "We couldn't start this deposit. Please try again." };
  }
  redirect(checkoutUrl); // Stripe Checkout; the webhook credits the deposit once paid
}

export async function depositAddress(assetCode: string) {
  const { user } = await requireUser();
  if (user.kycStatus !== "APPROVED" || !/^[A-Z]{2,6}$/.test(assetCode) || assetCode === "USD") return null;
  const addr = await getDepositAddress(user.id, assetCode);
  if (!addr) return null;
  const qr = await QRCode.toDataURL(addr.address, { margin: 1, width: 200 });
  return { address: addr.address, network: addr.network, sandbox: addr.sandbox, qr };
}
