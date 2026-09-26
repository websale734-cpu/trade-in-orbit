import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma 7 doesn't load .env files itself. Local development keeps Neon's
// connection strings in .env.local (written by `neon link` / `neon checkout`).
config({ path: ".env.local", quiet: true });
config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection.
    url: env("DATABASE_URL_UNPOOLED"),
  },
});
