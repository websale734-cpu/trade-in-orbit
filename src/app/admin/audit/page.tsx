import Link from "next/link";
import { requirePermission } from "@/server/admin/rbac";
import { db } from "@/server/db";
import { LocalTime } from "@/components/ui/local-time";

export const metadata = { title: "Audit log" };

/** Append-only log of every staff action (the database rejects edits and deletes). */
export default async function AdminAudit({ searchParams }: PageProps<"/admin/audit">) {
  await requirePermission("audit.view");
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const rows = await db.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    skip: page * 100,
    take: 100,
    include: { actor: { select: { name: true, email: true } } },
  });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Admin audit log</h1>
      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-subtle uppercase">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Staff</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line align-top last:border-0">
                <td className="px-4 py-2 text-xs whitespace-nowrap text-muted">
                  <LocalTime date={r.createdAt.toISOString()} />
                </td>
                <td className="px-4 py-2 text-xs">
                  {r.actor.name}
                  <span className="block text-muted">{r.ip}</span>
                </td>
                <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                <td className="px-4 py-2 text-xs">
                  {r.targetType === "user" ? (
                    <Link href={`/admin/users/${r.targetId}`} className="text-accent hover:underline">
                      user
                    </Link>
                  ) : (
                    r.targetType
                  )}{" "}
                  <span className="font-mono text-muted">{r.targetId?.slice(-8)}</span>
                </td>
                <td className="max-w-md px-4 py-2 font-mono text-[11px] break-all text-muted">
                  {r.details ? JSON.stringify(r.details) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3 text-sm">
        {page > 0 && (
          <Link href={`?page=${page - 1}`} className="text-accent">
            ← Newer
          </Link>
        )}
        {rows.length === 100 && (
          <Link href={`?page=${page + 1}`} className="text-accent">
            Older →
          </Link>
        )}
      </div>
    </div>
  );
}
