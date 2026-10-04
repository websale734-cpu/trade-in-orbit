"use server";

import { z } from "zod";
import { siteConfig } from "@/config/site";
import { getRequestInfo } from "@/server/request-info";
import { formatRetry, rateLimit } from "@/server/rate-limit";
import { contactFormEmail, sendEmail } from "@/server/notify/email";
import type { FormState } from "@/components/ui/form";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(100, "Keep your name under 100 characters."),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")).pipe(z.string().max(254)),
  message: z
    .string()
    .trim()
    .min(10, "Write a message (at least 10 characters).")
    .max(5000, "Keep your message under 5,000 characters."),
});

export async function sendContactMessage(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const raw = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
  const values = { name: raw.name ?? "", email: raw.email ?? "", message: raw.message ?? "" };
  // Honeypot: real people never see or fill this field.
  if (raw.company_url) return { message: "sent", values: { name: values.name, email: values.email } };

  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors, values };
  }
  const ip = (await getRequestInfo()).ip ?? "unknown";
  const rl = await rateLimit(`contact:${ip}`, 5, 3_600);
  if (!rl.ok) return { error: `Too many messages from this network. Try again in ${formatRetry(rl.retryAfterSeconds)}.`, values };

  try {
    await sendEmail(contactFormEmail(siteConfig.contactInbox, parsed.data));
  } catch (err) {
    console.error("[contact] send failed", err);
    return {
      error: `We couldn't send your message just now. Please try again, or email us at ${siteConfig.contactInbox}.`,
      values,
    };
  }
  return { message: "sent", values: { name: parsed.data.name, email: parsed.data.email } };
}
