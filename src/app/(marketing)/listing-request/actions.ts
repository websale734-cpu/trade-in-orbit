"use server";

import { z } from "zod";
import { db } from "@/server/db";
import { getSession } from "@/server/auth/session";
import { getRequestInfo } from "@/server/request-info";
import { formatRetry, rateLimit } from "@/server/rate-limit";
import type { FormState } from "@/components/ui/form";

const schema = z.object({
  projectName: z.string().trim().min(2, "Enter the project name.").max(80),
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/, "Use 2-10 letters or digits."),
  website: z.url({ protocol: /^https$/, error: "Enter the project's https:// website." }).max(200),
  network: z.string().trim().max(40).optional(),
  contract: z.string().trim().max(120).optional(),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")).pipe(z.string().max(254)),
  message: z.string().trim().min(20, "Tell us a little about the project (at least 20 characters).").max(3000),
});

export async function submitListingRequest(_prev: FormState | undefined, fd: FormData): Promise<FormState> {
  const raw = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
  const values = { ...raw };
  delete values.company_url; // honeypot, never echoed
  // Honeypot: real people never see or fill this field.
  if (raw.company_url) return { message: "Thanks! We've received your request." };

  const parsed = schema.safeParse({ ...raw, network: raw.network || undefined, contract: raw.contract || undefined });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors, values };
  }
  const ip = (await getRequestInfo()).ip ?? "unknown";
  const rl = await rateLimit(`listing:${ip}`, 5, 86_400);
  if (!rl.ok) return { error: `Too many requests from this network. Try again in ${formatRetry(rl.retryAfterSeconds)}.`, values };

  const session = await getSession();
  await db.listingRequest.create({ data: { ...parsed.data, userId: session?.userId ?? null } });
  return { message: "Thanks! We've received your request. Our listings team reviews every submission and will email you if we'd like to talk." };
}
