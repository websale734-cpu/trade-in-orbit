import "server-only";
import { db } from "../db";
import { notify } from "./notifications";
import { decisionEmail, sendEmail } from "./email";
import { formatQty } from "@/lib/assets";
import type { NotificationType } from "@/generated/prisma/client";

/**
 * Tell the customer about an admin decision, both in the app (the bell) and by
 * email, with the same wording. Never throws: a failed email or push can't undo
 * a decision that's already been recorded.
 */
export type Decision =
  | { kind: "DEPOSIT_APPROVED"; amount: string; assetCode: string }
  | { kind: "DEPOSIT_REJECTED"; amount: string; assetCode: string; reason?: string | null }
  | { kind: "WITHDRAWAL_APPROVED"; amount: string; assetCode: string }
  | { kind: "WITHDRAWAL_REJECTED"; amount: string; assetCode: string; refunded: string; reason?: string | null }
  | { kind: "KYC_APPROVED" }
  | { kind: "KYC_REJECTED"; reason?: string | null };

type Message = {
  type: NotificationType;
  title: string;
  body: string;
  details: [string, string][];
  link: string;
  linkLabel: string;
};

const coins = (amount: string, code: string) => `${formatQty(amount)} ${code}`;
const because = (reason?: string | null) => (reason ? `: ${reason.replace(/[.\s]+$/, "")}` : "");

export function decisionMessage(d: Decision): Message {
  switch (d.kind) {
    case "DEPOSIT_APPROVED":
      return {
        type: "ACCOUNT",
        title: "Deposit approved",
        body: `Your deposit of ${coins(d.amount, d.assetCode)} was approved and added to your balance.`,
        details: [
          ["Amount", coins(d.amount, d.assetCode)],
          ["Coin", d.assetCode],
          ["Status", "Success"],
        ],
        link: "/deposit",
        linkLabel: "View your deposits",
      };
    case "DEPOSIT_REJECTED":
      return {
        type: "ACCOUNT",
        title: "Deposit rejected",
        body: `Your deposit of ${coins(d.amount, d.assetCode)} was rejected${because(d.reason)}. Your balance hasn't changed. If you think this is a mistake, contact support.`,
        details: [
          ["Amount", coins(d.amount, d.assetCode)],
          ["Coin", d.assetCode],
          ["Status", "Failed"],
          ...(d.reason ? ([["Reason", d.reason]] as [string, string][]) : []),
        ],
        link: "/deposit",
        linkLabel: "View your deposits",
      };
    case "WITHDRAWAL_APPROVED":
      return {
        type: "ACCOUNT",
        title: "Withdrawal approved",
        body: `Your withdrawal of ${coins(d.amount, d.assetCode)} was approved and is on its way to your wallet.`,
        details: [
          ["Amount", coins(d.amount, d.assetCode)],
          ["Coin", d.assetCode],
          ["Status", "Success"],
        ],
        link: "/withdraw",
        linkLabel: "View your withdrawals",
      };
    case "WITHDRAWAL_REJECTED":
      return {
        type: "ACCOUNT",
        title: "Withdrawal rejected",
        body: `Your withdrawal of ${coins(d.amount, d.assetCode)} was rejected${because(d.reason)}. ${coins(d.refunded, d.assetCode)} has been returned to your balance.`,
        details: [
          ["Amount", coins(d.amount, d.assetCode)],
          ["Coin", d.assetCode],
          ["Status", "Failed"],
          ...(d.reason ? ([["Reason", d.reason]] as [string, string][]) : []),
        ],
        link: "/withdraw",
        linkLabel: "View your withdrawals",
      };
    case "KYC_APPROVED":
      return {
        type: "KYC",
        title: "KYC approved",
        body: "Your identity is verified. Deposits and withdrawals are now unlocked.",
        details: [["Status", "Approved"]],
        link: "/deposit",
        linkLabel: "Make a deposit",
      };
    case "KYC_REJECTED":
      return {
        type: "KYC",
        title: "KYC rejected",
        body: `We couldn't verify your identity${because(d.reason)}. Please submit new documents.`,
        details: [["Status", "Rejected"], ...(d.reason ? ([["Reason", d.reason]] as [string, string][]) : [])],
        link: "/onboarding/kyc",
        linkLabel: "Submit new documents",
      };
  }
}

export async function notifyDecision(userId: string, d: Decision): Promise<void> {
  const m = decisionMessage(d);
  await notify(userId, { type: m.type, title: m.title, body: m.body, link: m.link }).catch((err) =>
    console.error("[notify] decision", d.kind, err),
  );
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (user)
      await sendEmail(
        decisionEmail(user.email, {
          subject: d.kind.startsWith("KYC") ? m.title : `${m.title}: ${m.details[0][1]}`,
          body: m.body,
          details: m.details,
          linkPath: m.link,
          linkLabel: m.linkLabel,
        }),
      );
  } catch (err) {
    console.error("[email] decision", d.kind, err);
  }
}
