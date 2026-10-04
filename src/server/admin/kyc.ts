import "server-only";
import { db } from "../db";
import { notifyDecision } from "../notify/decisions";

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
  // In-app notification and email, same wording.
  await notifyDecision(
    sub.userId,
    decision === "APPROVED" ? { kind: "KYC_APPROVED" } : { kind: "KYC_REJECTED", reason },
  );
  return sub;
}
