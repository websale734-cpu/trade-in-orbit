import { getSession } from "@/server/auth/session";
import { chatMessages } from "@/server/support";

/**
 * GET /api/support/chat?since=ISO
 * The signed-in customer's live-chat messages (polled by the chat widget).
 * Only ever returns the caller's own conversation.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const sinceRaw = new URL(request.url).searchParams.get("since");
  const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw) : undefined;
  const data = await chatMessages(session.userId, since);
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
