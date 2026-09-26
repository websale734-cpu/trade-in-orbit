import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Unit tests (pure logic, no database or network). Run with `npm test`. */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside the React server runtime; it's a no-op in tests.
      "server-only": fileURLToPath(new URL("./tests/unit/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    env: {
      // Throwaway values so modules that read env at call time work in isolation.
      SESSION_SECRET: "unit-test-session-secret-unit-test-session-secret",
      DATA_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      DATABASE_URL: "postgresql://unit:test@localhost:5432/unit",
    },
  },
});
