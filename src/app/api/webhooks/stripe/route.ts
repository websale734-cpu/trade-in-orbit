import { createHmac, timingSafeEqual } from "node:crypto";
import { completeDeposit, failDeposit } from "@/server/funding";

/**
 * POST /api/webhooks/stripe
 * Confirms card deposits. The request is trusted only if its Stripe-Signature
 * (HMAC-SHA256 over "timestamp.body" with STRIPE_WEBHOOK_SECRET) is valid and
 * less than 5 minutes old. Crediting is idempotent, so Stripe's retries are safe.
 */
const TOLERANCE_S = 300;

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook not configured", { status: 503 });

  const body = await request.text();
  const header = request.headers.get("stripe-signature") ?? "";
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  const expected = createHmac("sha256", secret).update(`${parts.t}.${body}`).digest("hex");
  const given = header
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .map((kv) => kv.slice(3));
  const valid =
    Number.isFinite(t) &&
    Math.abs(Date.now() / 1000 - t) <= TOLERANCE_S &&
    given.some((sig) => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
  if (!valid) return new Response("Invalid signature", { status: 400 });

  const event = JSON.parse(body) as {
    type: string;
    data: { object: { id: string; payment_status?: string; metadata?: { depositId?: string } } };
  };
  const session = event.data.object;
  const depositId = session.metadata?.depositId;
  if (!depositId) return Response.json({ received: true });

  if (event.type === "checkout.session.completed" && session.payment_status === "paid") {
    await completeDeposit(depositId, session.id);
  } else if (event.type === "checkout.session.async_payment_succeeded") {
    await completeDeposit(depositId, session.id);
  } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    await failDeposit(depositId, "Card payment was not completed.");
  }
  return Response.json({ received: true });
}
