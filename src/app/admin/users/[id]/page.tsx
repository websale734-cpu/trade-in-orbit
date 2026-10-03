import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requirePermission } from "@/server/admin/rbac";
import { db } from "@/server/db";
import { LocalTime } from "@/components/ui/local-time";
import { ActionForm } from "@/components/admin/action-form";
import { adminButton, adminInput } from "@/components/admin/styles";
import { cn } from "@/lib/utils";
import { adjustUserBalance, decideKyc, setUserRole, setUserStatus } from "../../actions";

export const metadata = { title: "User" };

export default async function AdminUser({ params }: PageProps<"/admin/users/[id]">) {
  const { user: admin } = await requirePermission("users.view");
  const { id } = await params;
  const u = await db.user.findUnique({
    where: { id },
    include: {
      accounts: { include: { ledgerAccounts: { where: { balance: { not: 0 } } } }, orderBy: { createdAt: "asc" } },
      kycSubmissions: { orderBy: { submittedAt: "desc" }, take: 3 },
      securityEvents: { orderBy: { createdAt: "desc" }, take: 10 },
      journalEntries: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!u) notFound();
  const assets = await db.asset.findMany({ orderBy: { sortOrder: "asc" }, select: { code: true } });
  const realAccounts = u.accounts.filter((a) => a.type !== "DEMO");
  const latestKyc = u.kycSubmissions[0];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/users" className="text-sm text-muted hover:text-fg">
          ← Users
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{u.name}</h1>
        <p className="text-sm text-muted">
          {u.email} · {u.phone ?? "no phone"} · joined <LocalTime date={u.createdAt.toISOString()} />
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Status", u.status, u.status === "SUSPENDED" ? "text-down" : "text-up"],
          ["Role", u.role, ""],
          ["KYC", `${u.kycStatus} (level ${u.kycLevel})`, u.kycStatus === "APPROVED" ? "text-up" : "text-warn"],
          ["2FA", u.totpEnabledAt ? "On" : "Off", u.totpEnabledAt ? "text-up" : "text-muted"],
        ].map(([k, v, c]) => (
          <div key={k} className="glass rounded-2xl p-4">
            <p className="text-xs text-muted">{k}</p>
            <p className={cn("mt-1 font-semibold", c)}>{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass rounded-2xl p-5">
          <h2 className="font-semibold">Balances</h2>
          {u.accounts.map((a) => (
            <div key={a.id} className="mt-3">
              <p className="text-sm font-medium">
                {a.name} <span className="text-xs text-muted">{a.type}</span>
              </p>
              <p className="tabular text-sm text-muted">
                {a.ledgerAccounts.length === 0
                  ? "Empty"
                  : a.ledgerAccounts
                      .map(
                        (l) =>
                          `${Number(l.balance).toLocaleString("en-US", { maximumFractionDigits: 8 })} ${l.assetCode}`,
                      )
                      .join(" · ")}
              </p>
            </div>
          ))}
        </section>

        <section className="glass space-y-5 rounded-2xl p-5">
          {can(admin, "users.suspend") && (
            <ActionForm action={setUserStatus}>
              <h2 className="font-semibold">{u.status === "SUSPENDED" ? "Reactivate account" : "Suspend account"}</h2>
              <input type="hidden" name="userId" value={u.id} />
              <input type="hidden" name="status" value={u.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"} />
              <input name="reason" placeholder="Reason (recorded in the audit log)" className={adminInput} required />
              <button
                className={cn(adminButton, u.status === "SUSPENDED" ? "bg-up/15 text-up" : "bg-down/15 text-down")}
              >
                {u.status === "SUSPENDED" ? "Reactivate" : "Suspend and sign out"}
              </button>
            </ActionForm>
          )}
          {can(admin, "ledger.adjust") && realAccounts.length > 0 && (
            <ActionForm action={adjustUserBalance}>
              <h2 className="font-semibold">Balance adjustment</h2>
              <p className="text-xs text-muted">
                Posted as a ledger journal entry with your name and reason. Balances are never edited directly.
              </p>
              <input type="hidden" name="userId" value={u.id} />
              <div className="grid grid-cols-3 gap-2">
                <select name="accountId" className={adminInput} aria-label="Account">
                  {realAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select name="assetCode" className={adminInput} aria-label="Asset">
                  {assets.map((a) => (
                    <option key={a.code}>{a.code}</option>
                  ))}
                </select>
                <input name="amount" placeholder="+25 or -25" className={adminInput} aria-label="Signed amount" />
              </div>
              {/* No minLength here: the ledger enforces 10 characters and returns a clear
                  message. A browser minLength blocked the submit before the server saw it. */}
              <input name="reason" placeholder="Reason (min 10 characters)" className={adminInput} required />
              <button className={cn(adminButton, "bg-surface-strong")}>Post adjustment</button>
            </ActionForm>
          )}
          {can(admin, "roles.manage") && u.id !== admin.id && (
            <ActionForm action={setUserRole}>
              <h2 className="font-semibold">Role</h2>
              <input type="hidden" name="userId" value={u.id} />
              <div className="flex gap-2">
                <select name="role" defaultValue={u.role} className={adminInput} aria-label="Role">
                  {["USER", "SUPPORT", "COMPLIANCE", "ADMIN", "SUPER_ADMIN"].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <button className={cn(adminButton, "bg-surface-strong")}>Save</button>
              </div>
            </ActionForm>
          )}
          {can(admin, "kyc.review") && latestKyc && (
            // A single form that stays mounted once the submission is decided, so the
            // success message survives the refresh that removes the controls.
            <ActionForm action={decideKyc}>
              <h2 className="font-semibold">KYC review</h2>
              <p className="text-xs text-muted">
                {latestKyc.documentType.replace("_", " ")} issued in {latestKyc.documentCountry} ·{" "}
                <Link href={`/admin/kyc?id=${latestKyc.id}`} className="text-accent hover:underline">
                  View documents
                </Link>
              </p>
              {latestKyc.status === "PENDING" && (
                <>
                  <input type="hidden" name="submissionId" value={latestKyc.id} />
                  <input
                    name="reason"
                    placeholder="Rejection reason (shown to the customer)"
                    className={adminInput}
                    aria-label="Rejection reason"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button name="decision" value="APPROVED" className={cn(adminButton, "w-full bg-up/15 text-up")}>
                      Approve identity
                    </button>
                    <button name="decision" value="REJECTED" className={cn(adminButton, "w-full bg-down/15 text-down")}>
                      Reject
                    </button>
                  </div>
                </>
              )}
            </ActionForm>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass rounded-2xl p-5">
          <h2 className="font-semibold">Recent ledger entries</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {u.journalEntries.map((e) => (
              <li key={e.id} className="py-2">
                <span className="text-xs font-semibold">{e.type}</span> {e.description}
                {e.reason && <span className="block text-xs text-warn">Reason: {e.reason}</span>}
                <span className="block text-xs text-muted">
                  <LocalTime date={e.createdAt.toISOString()} />
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="glass rounded-2xl p-5">
          <h2 className="font-semibold">Security log</h2>
          <ul className="mt-3 divide-y divide-line text-sm">
            {u.securityEvents.map((e) => (
              <li key={e.id} className="py-2">
                <span className={cn("text-xs font-semibold", e.type.includes("FAILED") && "text-down")}>{e.type}</span>
                <span className="block text-xs text-muted">
                  {[e.device, e.ip, e.location].filter(Boolean).join(" · ")} ·{" "}
                  <LocalTime date={e.createdAt.toISOString()} />
                </span>
              </li>
            ))}
          </ul>
          {latestKyc && (
            <div className="mt-4 text-sm">
              <p>
                Latest KYC: <strong>{latestKyc.status}</strong>{" "}
                <Link href={`/admin/kyc?id=${latestKyc.id}`} className="text-accent hover:underline">
                  View documents
                </Link>
              </p>
              {latestKyc.status === "REJECTED" && latestKyc.rejectionReason && (
                <p className="mt-1 text-xs text-down">Rejection reason: {latestKyc.rejectionReason}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
