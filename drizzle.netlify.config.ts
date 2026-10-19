import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_DIRECT_URL or DATABASE_URL before applying the schema.");

// Explicit config for hosted DBs. Leave drizzle.config.json intact for the
// sandbox's managed local database; never use its local URL for production.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: false,
});
