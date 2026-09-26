import "server-only";
import { getSession } from "./auth/session";
import { nextOnboardingStep } from "./auth/dal";
import { rateLimit } from "./rate-limit";

/**
 * Guard for file-download route handlers (statements, tax reports, CSV
 * exports): a live, fully onboarded session, with a per-user rate limit since
 * report generation is comparatively expensive.
 */
export async function downloadUser() {
  const session = await getSession();
  if (!session || nextOnboardingStep(session.user)) return { error: new Response("Unauthorized", { status: 401 }) } as const;
  const rl = await rateLimit(`download:${session.userId}`, 30, 600);
  if (!rl.ok) return { error: new Response("Too many downloads. Try again shortly.", { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }) } as const;
  return { user: session.user } as const;
}

export function fileResponse(body: Uint8Array | string, filename: string, type: string) {
  return new Response(typeof body === "string" ? body : Buffer.from(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
