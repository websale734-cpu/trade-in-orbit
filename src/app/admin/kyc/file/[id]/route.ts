import { db } from "@/server/db";
import { decryptBytes } from "@/server/crypto";
import { assertPermission, audit, ForbiddenError } from "@/server/admin/rbac";

/**
 * GET /admin/kyc/file/:id
 * Decrypts and streams one KYC document to compliance staff only. Every view
 * is audit-logged. Never cached, never sniffed, always displayed inline.
 */
export async function GET(_req: Request, ctx: RouteContext<"/admin/kyc/file/[id]">) {
  let admin;
  try {
    admin = await assertPermission("kyc.review");
  } catch (err) {
    if (err instanceof ForbiddenError) return new Response("Forbidden", { status: 403 });
    throw err;
  }
  const { id } = await ctx.params;
  const file = await db.kycFile.findUnique({ where: { id } });
  if (!file) return new Response("Not found", { status: 404 });

  const bytes = decryptBytes(file.dataEnc);
  await audit(admin, "kyc.file.view", { type: "kyc_file", id }, { submissionId: file.submissionId, kind: file.kind });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
