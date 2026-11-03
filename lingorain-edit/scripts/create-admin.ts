import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import { users } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth";

/** Run privately against the intended DB. No public bootstrap/admin endpoint. */
async function main() {
  try {
    const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const name = (process.env.ADMIN_NAME || "Site administrator").trim().slice(0, 60);
    const password = process.env.ADMIN_PASSWORD || "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 200) {
      throw new Error("Set ADMIN_EMAIL and a unique ADMIN_PASSWORD (12–200 characters) before creating the administrator.");
    }
    await db.transaction(async tx => {
      const [existing] = await tx.select().from(users).where(eq(users.email, email)).for("update");
      if (existing) {
        if (existing.role !== "admin") throw new Error("That email belongs to a non-admin account. Choose a separate administrator email.");
        console.log("Administrator already exists. No role or password was changed.");
        return;
      }
      await tx.insert(users).values({ name, email, role: "admin", passwordHash: hashPassword(password), nativeLang: "en" });
      console.log("Administrator created. No password or database credential was printed.");
    });
  } finally { await pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Administrator setup failed."); process.exitCode = 1; });
