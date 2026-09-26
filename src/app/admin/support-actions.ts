"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { assertPermission, audit, ForbiddenError } from "@/server/admin/rbac";
import { assignTicket, setTicketStatus, staffReply, SupportError } from "@/server/support";
import type { FormState } from "@/components/ui/form";

function failure(err: unknown): FormState {
  if (err instanceof ForbiddenError) return { error: "You don't have permission to do that." };
  if (err instanceof SupportError) return { error: err.message };
  console.error("[admin/support]", err);
  return { error: "Something went wrong. Nothing was changed." };
}

export async function adminReply(_p: FormState | undefined, fd: FormData): Promise<FormState> {
  try {
    const staff = await assertPermission("support.manage");
    const ticketId = String(fd.get("ticketId") ?? "");
    await staffReply(staff, ticketId, String(fd.get("body") ?? ""));
    await audit(staff, "support.reply", { type: "ticket", id: ticketId });
    revalidatePath(`/admin/support/${ticketId}`);
    return { message: "Reply sent." };
  } catch (err) {
    return { ...failure(err), values: { body: String(fd.get("body") ?? "") } };
  }
}

export async function adminTicketUpdate(_p: FormState | undefined, fd: FormData): Promise<FormState> {
  try {
    const staff = await assertPermission("support.manage");
    const ticketId = String(fd.get("ticketId") ?? "");
    if (!(await db.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true } }))) return { error: "Ticket not found." };
    const op = fd.get("op");
    if (op === "assign-me") {
      await assignTicket(ticketId, staff.id);
      await audit(staff, "support.assign", { type: "ticket", id: ticketId }, { to: staff.id });
    } else if (op === "unassign") {
      await assignTicket(ticketId, null);
      await audit(staff, "support.unassign", { type: "ticket", id: ticketId });
    } else {
      const status = z.enum(["OPEN", "AWAITING_CUSTOMER", "RESOLVED", "CLOSED"]).parse(fd.get("status"));
      await setTicketStatus(ticketId, status);
      await audit(staff, "support.status", { type: "ticket", id: ticketId }, { status });
    }
    revalidatePath(`/admin/support/${ticketId}`);
    revalidatePath("/admin/support");
    return { message: "Updated." };
  } catch (err) {
    return failure(err);
  }
}

export async function updateListingRequest(_p: FormState | undefined, fd: FormData): Promise<FormState> {
  try {
    const staff = await assertPermission("listings.view");
    const id = String(fd.get("id") ?? "");
    const status = z.enum(["NEW", "REVIEWING", "ACCEPTED", "DECLINED"]).parse(fd.get("status"));
    await db.listingRequest.update({ where: { id }, data: { status } });
    await audit(staff, "listing.status", { type: "listing_request", id }, { status });
    revalidatePath("/admin/listings");
    return { message: `Marked ${status.toLowerCase()}.` };
  } catch (err) {
    return failure(err);
  }
}
