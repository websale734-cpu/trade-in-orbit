import { expect, test, type Page } from "@playwright/test";

/** Fail the test on any Content-Security-Policy violation or uncaught error. */
function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) problems.push(m.text());
  });
  page.on("pageerror", (e) => problems.push(e.message));
  return problems;
}

test.describe("public site", () => {
  test("landing page renders with a risk warning and a strict CSP", async ({ page }) => {
    const problems = watchConsole(page);
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    expect(res?.headers()["content-security-policy"]).toMatch(/'nonce-[^']+' 'strict-dynamic'/);
    await expect(page.locator("footer")).toContainText(/risk/i);
    await expect(page.getByText(/guaranteed returns?/i)).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  for (const path of ["/help", "/faq", "/about", "/careers", "/contact", "/listing-request", "/legal/risk"]) {
    test(`${path} loads`, async ({ page }) => {
      const problems = watchConsole(page);
      expect((await page.goto(path))?.status()).toBe(200);
      await expect(page.locator("h1")).toBeVisible();
      expect(problems).toEqual([]);
    });
  }

  test("unknown pages are real 404s", async ({ page }) => {
    expect((await page.goto("/blog"))?.status()).toBe(404);
  });

  test("signed-in areas redirect to login", async ({ page }) => {
    await page.goto("/history");
    await expect(page).toHaveURL(/\/login\?next=%2Fhistory/);
  });

  test("public API requires a key", async ({ request }) => {
    expect((await request.get("/api/v1/account")).status()).toBe(401);
  });
});

test.describe("signed in", () => {
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, "set E2E_EMAIL and E2E_PASSWORD to run");

  test("log in, see the dashboard and history, open support chat", async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto("/login");
    await page.locator("#email").fill(process.env.E2E_EMAIL!);
    await page.locator("#password").fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto("/history");
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    await page.getByRole("button", { name: "Chat with support" }).click();
    await expect(page.getByRole("dialog", { name: /chat/i })).toBeVisible();
    expect(problems).toEqual([]);
  });
});
