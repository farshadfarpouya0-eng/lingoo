import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Neon Marketplace injects DATABASE_URL (pooled) and DATABASE_URL_UNPOOLED.
// Only private schema/admin tooling uses the direct connection.
const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("Connect a hosted PostgreSQL database before applying the schema.");

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: false,
});
