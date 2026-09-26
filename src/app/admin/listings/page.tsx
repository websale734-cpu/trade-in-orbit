import { requirePermission } from "@/server/admin/rbac";
import { db } from "@/server/db";
import { LocalTime } from "@/components/ui/local-time";
import { ActionForm, adminButton, adminInput } from "@/components/admin/action-form";
import { updateListingRequest } from "../support-actions";

export const metadata = { title: "Listing requests" };

/** Coin listing requests submitted through the public form. Untrusted input: shown as plain text, links not auto-followed. */
export default async function AdminListings() {
  await requirePermission("listings.view");
  const requests = await db.listingRequest.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Coin listing requests</h1>
      <p className="text-sm text-muted">
        Submitted by projects through /listing-request. Treat links and claims as unverified until due diligence is done.
      </p>
      {requests.length === 0 && <p className="glass rounded-2xl p-5 text-sm text-muted">No requests yet.</p>}
      <div className="space-y-3">
        {requests.map((r) => (
          <section key={r.id} className="glass rounded-2xl p-4 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold">
                {r.projectName} ({r.symbol})
              </span>
              <span className="rounded bg-surface-strong px-2 py-0.5 text-xs font-bold">{r.status}</span>
              <span className="text-muted">{r.email}</span>
              <span className="text-xs text-muted">
                <LocalTime date={r.createdAt.toISOString()} />
              </span>
            </div>
            <p className="mt-1 text-muted break-all">
              {r.website}
              {r.network && ` · ${r.network}`}
              {r.contract && ` · ${r.contract}`}
            </p>
            <p className="mt-2 whitespace-pre-wrap">{r.message}</p>
            <ActionForm action={updateListingRequest} className="mt-3 flex flex-wrap items-center gap-2 space-y-0">
              <input type="hidden" name="id" value={r.id} />
              <select name="status" defaultValue={r.status} aria-label="Status" className={`${adminInput} w-44`}>
                <option value="NEW">New</option>
                <option value="REVIEWING">Reviewing</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="DECLINED">Declined</option>
              </select>
              <button type="submit" className={`${adminButton} border border-line`}>
                Save
              </button>
            </ActionForm>
          </section>
        ))}
      </div>
    </div>
  );
}
