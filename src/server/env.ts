import "server-only";
import { z } from "zod";

/**
 * Validated server-side environment.
 *
 * Parsed lazily on first use so `next build` works without secrets, and so a
 * misconfiguration fails loudly with a clear message instead of deep inside a
 * request. See .env.example for descriptions of every variable.
 */
const isProd = process.env.NODE_ENV === "production";

const base64Key = z.string().refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64-encoded");

const schema = z
  .object({
    DATABASE_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
    DATA_ENCRYPTION_KEY: base64Key,

    SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
    SESSION_MAX_HOURS: z.coerce.number().int().positive().default(12),

    EMAIL_PROVIDER: z.enum(["resend", "sendgrid", "console"]).default(isProd ? "resend" : "console"),
    RESEND_API_KEY: z.string().optional(),
    SENDGRID_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("Trade In Orbit <no-reply@orbtrade.example>"),

    SMS_PROVIDER: z.enum(["twilio", "console"]).default(isProd ? "twilio" : "console"),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_VERIFY_SERVICE_SID: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    // Printing codes to the console is a development convenience only.
    if (isProd && env.EMAIL_PROVIDER === "console")
      ctx.addIssue({ code: "custom", path: ["EMAIL_PROVIDER"], message: "console is not allowed in production" });
    if (isProd && env.SMS_PROVIDER === "console")
      ctx.addIssue({ code: "custom", path: ["SMS_PROVIDER"], message: "console is not allowed in production" });
    if (env.EMAIL_PROVIDER === "resend" && !env.RESEND_API_KEY)
      ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "required when EMAIL_PROVIDER=resend" });
    if (env.EMAIL_PROVIDER === "sendgrid" && !env.SENDGRID_API_KEY)
      ctx.addIssue({ code: "custom", path: ["SENDGRID_API_KEY"], message: "required when EMAIL_PROVIDER=sendgrid" });
    if (env.SMS_PROVIDER === "twilio") {
      for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "required when SMS_PROVIDER=twilio" });
      }
    }
  });

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment:\n${details}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
