import "server-only";
import { db } from "../db";
import { notify } from "../notify/notifications";

/** Approve or reject a KYC submission and update the user's verification level. */
export async function reviewKyc(
  submissionId: string,
  reviewerId: string,
  decision: "APPROVED" | "REJECTED",
  reason?: string,
) {
  const sub = await db.kycSubmission.findUnique({ where: { id: submissionId } });
  if (!sub || sub.status !== "PENDING") return null;
  if (sub.userId === reviewerId) throw new Error("You can't review your own verification.");

  await db.$transaction([
    db.kycSubmission.update({
      where: { id: submissionId },
      data: {
        status: decision,
        reviewerId,
        reviewedAt: new Date(),
        rejectionReason: decision === "REJECTED" ? reason : null,
      },
    }),
    db.user.update({
      where: { id: sub.userId },
      data: decision === "APPROVED" ? { kycStatus: "APPROVED", kycLevel: 1 } : { kycStatus: "REJECTED", kycLevel: 0 },
    }),
  ]);
  await notify(sub.userId, {
    type: "KYC",
    title: decision === "APPROVED" ? "Identity verified" : "Verification unsuccessful",
    body:
      decision === "APPROVED"
        ? "You're verified. Deposits and withdrawals are now unlocked."
        : `We couldn't verify your identity: ${reason}. Please submit new documents.`,
    link: decision === "APPROVED" ? "/deposit" : "/onboarding/kyc",
  }).catch(() => {});
  return sub;
}
