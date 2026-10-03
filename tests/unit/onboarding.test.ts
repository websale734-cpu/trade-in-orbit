import { afterEach, describe, expect, it, vi } from "vitest";

// dal.ts imports the session store and Next's router; neither is needed for these pure helpers.
vi.mock("@/server/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const LABELS = ["Account", "Email", "Phone", "2FA", "Identity"] as const;
const now = new Date();
const emailOnly = { emailVerifiedAt: now, phoneVerifiedAt: null, twoFactorPromptedAt: null };

/** env() caches its parse, so load a fresh copy of the modules per SMS setting. */
async function dalWith(smsProvider: string | undefined) {
  vi.resetModules();
  vi.stubEnv("EMAIL_PROVIDER", process.env.EMAIL_PROVIDER ?? "console");
  if (smsProvider === undefined) delete process.env.SMS_PROVIDER;
  else vi.stubEnv("SMS_PROVIDER", smsProvider);
  return import("@/server/auth/dal");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("onboarding without SMS", () => {
  it("skips phone verification when SMS_PROVIDER=none", async () => {
    const { nextOnboardingStep } = await dalWith("none");
    expect(nextOnboardingStep({ ...emailOnly, emailVerifiedAt: null })).toBe("email");
    expect(nextOnboardingStep(emailOnly)).toBe("two-factor");
    expect(nextOnboardingStep({ ...emailOnly, twoFactorPromptedAt: now })).toBeNull();
  });

  it("drops the Phone label from the progress bar", async () => {
    const { onboardingProgress } = await dalWith("none");
    expect(onboardingProgress(LABELS, 0)).toEqual({ steps: ["Account", "Email", "2FA", "Identity"], current: 1 });
    expect(onboardingProgress(LABELS, 1).current).toBe(2);
    expect(onboardingProgress(LABELS, 3).current).toBe(3);
    expect(onboardingProgress(LABELS, 4).current).toBe(4);
  });

  it("defaults to no SMS in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const { nextOnboardingStep } = await dalWith(undefined);
    expect(nextOnboardingStep(emailOnly)).toBe("two-factor");
  });
});

describe("onboarding with SMS", () => {
  it.each(["console", "twilio"])("requires phone verification when SMS_PROVIDER=%s", async (provider) => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC_test");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "test");
    vi.stubEnv("TWILIO_VERIFY_SERVICE_SID", "VA_test");
    const { nextOnboardingStep, onboardingProgress } = await dalWith(provider);
    expect(nextOnboardingStep(emailOnly)).toBe("phone");
    expect(nextOnboardingStep({ ...emailOnly, phoneVerifiedAt: now })).toBe("two-factor");
    expect(onboardingProgress(LABELS, 3)).toEqual({ steps: LABELS, current: 4 });
  });
});
