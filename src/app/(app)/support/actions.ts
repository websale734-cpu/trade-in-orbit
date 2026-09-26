"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/server/auth/dal";
import { createTicket, customerReply, MAX_MESSAGE, sendChatMessage, SUPPORT_CATEGORIES, SupportError } from "@/server/support";
import type { FormState } from "@/components/ui/form";

const ticketSchema = z.object({
  subject: z.string().trim().min(4, "Add a short subject.").max(120, "Keep the subject under 120 characters."),
  category: z.enum(SUPPORT_CATEGORIES, { error: "Choose a category." }),
  body: z.string().trim().min(10, "Describe the problem in a sentence or two.").max(MAX_MESSAGE),
});

export async function openTicket(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const values = { subject: String(fd.get("subject") ?? ""), category: String(fd.get("category") ?? ""), body: String(fd.get("body") ?? "") };
  const parsed = ticketSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors, values };
  }
  let id: string;
  try {
    id = (await createTicket(user.id, parsed.data)).id;
  } catch (err) {
    if (err instanceof SupportError) return { error: err.message, values };
    throw err;
  }
  redirect(`/support/${id}`);
}

export async function replyToTicket(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const ticketId = String(fd.get("ticketId") ?? "");
  const body = String(fd.get("body") ?? "");
  try {
    await customerReply(user.id, ticketId, body);
  } catch (err) {
    if (err instanceof SupportError) return { error: err.message, values: { body } };
    throw err;
  }
  revalidatePath(`/support/${ticketId}`);
  return { message: "Sent." };
}

/** Called by the chat widget. */
export async function postChatMessage(body: string): Promise<{ error?: string }> {
  const { user } = await requireUser();
  if (typeof body !== "string") return { error: "Invalid message." };
  try {
    await sendChatMessage(user.id, body);
    return {};
  } catch (err) {
    if (err instanceof SupportError) return { error: err.message };
    console.error("[chat]", err);
    return { error: "Message not sent. Try again." };
  }
}
