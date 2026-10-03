"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LocalTime } from "@/components/ui/local-time";
import { cn } from "@/lib/utils";

export type UserRowData = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  kycStatus: string;
  createdAt: string;
};

/**
 * A users-table row that opens the user's detail page on click anywhere in the
 * row. The name stays a real link so keyboard focus and middle-click still work;
 * its click is stopped so the row handler doesn't fire a second navigation.
 */
export function UserRow({ u }: { u: UserRowData }) {
  const router = useRouter();
  const href = `/admin/users/${u.id}`;
  return (
    <tr
      onClick={() => router.push(href)}
      className="cursor-pointer border-b border-line last:border-0 hover:bg-surface"
    >
      <td className="px-4 py-3">
        <Link href={href} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-accent">
          {u.name}
        </Link>
        <div className="text-xs text-muted">{u.email}</div>
      </td>
      <td className="px-4 py-3 text-xs">{u.role}</td>
      <td className={cn("px-4 py-3 text-xs font-semibold", u.status === "SUSPENDED" ? "text-down" : "text-up")}>
        {u.status}
      </td>
      <td className="px-4 py-3 text-xs">{u.kycStatus}</td>
      <td className="px-4 py-3 text-xs text-muted">
        <LocalTime date={u.createdAt} />
      </td>
    </tr>
  );
}
