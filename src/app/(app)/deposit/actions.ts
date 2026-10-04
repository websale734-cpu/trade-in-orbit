"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth/dal";
import { LedgerError } from "@/server/ledger";
import { createDeposit } from "@/server/funding";
import type { FormState } from "@/components/ui/form";

export type DepositState = FormState & {
  created?: { reference: string; amount: string; assetCode: string; network: string };
};

const schema = z.object({
  assetCode: z.string().regex(/^[A-Z0-9]{2,10}$/, "Choose a coin."),
  networkId: z.string().regex(/^[A-Z0-9]{2,10}$/, "Choose a network."),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, "Enter the amount you sent."),
  txHash: z.string().max(200, "That transaction ID is too long.").optional(),
});

/** The customer has sent coins to the platform wallet: record a Pending deposit for an admin to approve. */
export async function submitDeposit(_prev: DepositState | undefined, fd: FormData): Promise<DepositState> {
  const { user } = await requireUser();
  const raw = Object.fromEntries(fd);
  const values = { amount: String(raw.amount ?? ""), txHash: String(raw.txHash ?? "") };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };
  try {
    const d = await createDeposit({ user, ...parsed.data });
    revalidatePath("/deposit");
    revalidatePath("/history");
    return {
      created: {
        reference: d.reference,
        amount: d.amount.toString(),
        assetCode: d.assetCode,
        network: d.network ?? "",
      },
    };
  } catch (err) {
    if (err instanceof LedgerError) return { error: err.message, values };
    console.error("[deposit]", err);
    return { error: "We couldn't record this deposit. Please try again.", values };
  }
}
