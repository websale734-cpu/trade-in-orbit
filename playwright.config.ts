import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke end-to-end tests. Locally they reuse a running `npm run dev` on :3000
 * and the installed Microsoft Edge (PW_CHANNEL=msedge, the default on
 * Windows). In CI they build + start the app and use Playwright's Chromium.
 *
 * Signed-in tests run only when E2E_EMAIL / E2E_PASSWORD are set (a seeded
 * dev-branch user without 2FA), so CI never needs production credentials.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const channel = process.env.PW_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel } },
    { name: "mobile", use: { ...devices["Pixel 7"], channel } },
  ],
  webServer: process.env.CI
    ? { command: "npm run start", url: baseURL, timeout: 180_000, reuseExistingServer: false }
    : undefined,
});
