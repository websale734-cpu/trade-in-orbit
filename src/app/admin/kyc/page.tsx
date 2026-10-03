import Link from "next/link";
import { requirePermission } from "@/server/admin/rbac";
import { db } from "@/server/db";
import { LocalTime } from "@/components/ui/local-time";
import { ActionForm } from "@/components/admin/action-form";
import { adminButton, adminInput } from "@/components/admin/styles";
import { cn } from "@/lib/utils";
import { decideKyc } from "../actions";

export const metadata = { title: "KYC queue" };

/** Pending identity verifications, oldest first; select one to review its documents. */
export default async function AdminKyc({ searchParams }: PageProps<"/admin/kyc">) {
  await requirePermission("kyc.review");
  const sp = await searchParams;
  const pending = await db.kycSubmission.findMany({
    where: { status: "PENDING" },
    orderBy: { submittedAt: "asc" },
    include: { user: { select: { name: true, email: true } } },
    take: 50,
  });
  const selectedId = typeof sp.id === "string" ? sp.id : pending[0]?.id;
  const selected = selectedId
    ? await db.kycSubmission.findUnique({
        where: { id: selectedId },
        include: {
          user: true,
          files: { select: { id: true, kind: true, mimeType: true, sizeBytes: true } },
          reviewer: { select: { name: true } },
        },
      })
    : null;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">KYC review queue</h1>
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <ul className="glass h-fit divide-y divide-line rounded-2xl text-sm">
          {pending.length === 0 && <li className="p-4 text-muted">Nothing waiting for review.</li>}
          {pending.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/kyc?id=${p.id}`}
                className={cn("block p-3 hover:bg-surface", p.id === selectedId && "bg-surface-strong")}
              >
                <span className="font-medium">{p.user.name}</span>
                <span className="block text-xs text-muted">
                  {p.documentType} · {p.documentCountry} · <LocalTime date={p.submittedAt.toISOString()} />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {selected ? (
          <section className="glass space-y-5 rounded-2xl p-5">
            <div>
              <h2 className="text-lg font-semibold">{selected.user.name}</h2>
              <p className="text-sm text-muted">
                {selected.user.email} · {selected.documentType.replace("_", " ")} issued in {selected.documentCountry} ·
                status <strong className="text-fg">{selected.status}</strong>
                {selected.reviewer && ` (by ${selected.reviewer.name})`}
              </p>
              <p className="mt-1 text-xs text-muted">
                Compare the name on the document with the account name, and the selfie with the ID photo.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {selected.files.map((f) => (
                <figure key={f.id} className="rounded-xl border border-line p-2">
                  {f.mimeType === "application/pdf" ? (
                    <a
                      href={`/admin/kyc/file/${f.id}`}
                      target="_blank"
                      rel="noopener"
                      className="grid h-48 place-items-center text-sm text-accent"
                    >
                      Open PDF
                    </a>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- private, auth-gated, uncached document
                    <img
                      src={`/admin/kyc/file/${f.id}`}
                      alt={f.kind}
                      className="h-48 w-full rounded-lg bg-white object-contain"
                    />
                  )}
                  <figcaption className="mt-2 text-xs text-muted">
                    {f.kind.replace("_", " ")} · {(f.sizeBytes / 1024).toFixed(0)} KB
                  </figcaption>
                </figure>
              ))}
            </div>
            {selected.status === "PENDING" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <ActionForm action={decideKyc}>
                  <input type="hidden" name="submissionId" value={selected.id} />
                  <input type="hidden" name="decision" value="APPROVED" />
                  <button className={cn(adminButton, "w-full bg-up/15 text-up")}>Approve identity</button>
                </ActionForm>
                <ActionForm action={decideKyc}>
                  <input type="hidden" name="submissionId" value={selected.id} />
                  <input type="hidden" name="decision" value="REJECTED" />
                  <input
                    name="reason"
                    placeholder="Reason shown to the customer (e.g. photo is blurry)"
                    className={adminInput}
                    required
                  />
                  <button className={cn(adminButton, "w-full bg-down/15 text-down")}>Reject</button>
                </ActionForm>
              </div>
            ) : (
              selected.rejectionReason && (
                <p className="text-sm text-down">Rejection reason: {selected.rejectionReason}</p>
              )
            )}
          </section>
        ) : (
          <p className="text-sm text-muted">Select a submission.</p>
        )}
      </div>
    </div>
  );
}
