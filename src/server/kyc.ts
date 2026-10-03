import "server-only";
import { db } from "./db";
import { encryptBytes, sha256Hex } from "./crypto";
import { KYC_MAX_FILE_BYTES } from "@/lib/kyc-limits";
import type { KycDocumentType, KycFileKind } from "@/generated/prisma/client";

/**
 * KYC document intake.
 *
 * Files are checked by their actual content (magic bytes), not by extension or
 * the browser-supplied MIME type, then AES-256-GCM encrypted before storage.
 * They're stored in Postgres, which is simple and adequate at launch volume. To
 * move to object storage later (e.g. a private Supabase Storage bucket or S3), swap
 * `storeFile` and keep the metadata table.
 */
export const KYC_MAX_BYTES = KYC_MAX_FILE_BYTES;

type Sniffed = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

function sniff(b: Buffer): Sniffed | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP")
    return "image/webp";
  if (b.length >= 5 && b.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export type ValidFile = { kind: KycFileKind; bytes: Buffer; mimeType: Sniffed };

/** Validate one upload. Selfies must be images; ID documents may also be PDFs. */
export async function validateKycFile(
  value: FormDataEntryValue | null,
  kind: KycFileKind,
): Promise<{ ok: true; file: ValidFile } | { ok: false; error: string }> {
  if (!(value instanceof File) || value.size === 0) return { ok: false, error: "Please choose a file." };
  if (value.size > KYC_MAX_BYTES) return { ok: false, error: "File is larger than 5 MB." };

  const bytes = Buffer.from(await value.arrayBuffer());
  const mimeType = sniff(bytes);
  if (!mimeType) return { ok: false, error: "Use a JPG, PNG, WebP or PDF file." };
  if (kind === "SELFIE" && mimeType === "application/pdf")
    return { ok: false, error: "Your selfie must be a photo (JPG, PNG or WebP)." };
  return { ok: true, file: { kind, bytes, mimeType } };
}

/** Store a submission and its encrypted files, and mark the user's KYC as pending review. */
export async function createKycSubmission(input: {
  userId: string;
  documentType: KycDocumentType;
  documentCountry: string;
  files: ValidFile[];
}): Promise<string> {
  const submission = await db.$transaction(async (tx) => {
    const created = await tx.kycSubmission.create({
      data: {
        userId: input.userId,
        documentType: input.documentType,
        documentCountry: input.documentCountry,
        files: {
          create: input.files.map((f) => ({
            kind: f.kind,
            mimeType: f.mimeType,
            sizeBytes: f.bytes.length,
            sha256: sha256Hex(f.bytes),
            dataEnc: new Uint8Array(encryptBytes(f.bytes)),
          })),
        },
      },
    });
    await tx.user.update({ where: { id: input.userId }, data: { kycStatus: "PENDING" } });
    return created;
  });
  return submission.id;
}

/** The user's most recent submission (for the status screen). */
export function latestKycSubmission(userId: string) {
  return db.kycSubmission.findFirst({
    where: { userId },
    orderBy: { submittedAt: "desc" },
    select: { id: true, status: true, rejectionReason: true, submittedAt: true, documentType: true },
  });
}
