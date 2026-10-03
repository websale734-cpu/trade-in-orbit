import { requirePermission } from "@/server/admin/rbac";
import { db } from "@/server/db";
import { adminInput } from "@/components/admin/styles";
import { UserRow } from "./user-row";

export const metadata = { title: "Users" };

export default async function AdminUsers({ searchParams }: PageProps<"/admin/users">) {
  await requirePermission("users.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const users = await db.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { id: q },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, name: true, email: true, role: true, status: true, kycStatus: true, createdAt: true },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <form className="flex max-w-xl gap-2" role="search">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by email, name, phone or ID"
          className={adminInput}
          aria-label="Search users"
        />
        <button className="h-10 rounded-lg bg-surface-strong px-4 text-sm font-semibold">Search</button>
      </form>
      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-subtle uppercase">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">KYC</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} u={{ ...u, createdAt: u.createdAt.toISOString() }} />
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
