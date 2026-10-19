import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Uses DATABASE_URL from the environment (local .env or Vercel env).
// Falls back to the local sandbox Postgres when DATABASE_URL is not set.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
  verbose: false,
  strict: false,
});
