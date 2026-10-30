import "dotenv/config";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { Client } from "pg";

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
const secret = process.env.PAYOUT_ENCRYPTION_KEY || "";
const apply = process.argv.includes("--apply");
if (!connectionString) throw new Error("Set DATABASE_DIRECT_URL (preferred) or DATABASE_URL.");
if (secret.length < 32) throw new Error("Set PAYOUT_ENCRYPTION_KEY to a stable secret of at least 32 characters.");

const key = createHash("sha256").update(`lingorain:payout-details:v1:${secret}`).digest();
function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `p1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}
const isEncrypted = value => typeof value === "string" && value.startsWith("p1:");
const client = new Client({ connectionString, connectionTimeoutMillis: 15000, statement_timeout: 60000 });
try {
  await client.connect();
  await client.query("BEGIN");
  const teachers = await client.query("SELECT user_id, payout_account FROM teacher_profiles WHERE payout_account <> '' FOR UPDATE");
  const payouts = await client.query("SELECT id, account FROM payouts WHERE account <> '' FOR UPDATE");
  const teacherRows = teachers.rows.filter(r => !isEncrypted(r.payout_account));
  const payoutRows = payouts.rows.filter(r => !isEncrypted(r.account));
  console.log(`Teacher profile payout accounts needing encryption: ${teacherRows.length}`);
  console.log(`Payout history accounts needing encryption: ${payoutRows.length}`);
  if (apply) {
    for (const row of teacherRows) {
      await client.query("UPDATE teacher_profiles SET payout_account = $1 WHERE user_id = $2", [encrypt(row.payout_account), row.user_id]);
    }
    for (const row of payoutRows) {
      await client.query("UPDATE payouts SET account = $1 WHERE id = $2", [encrypt(row.account), row.id]);
    }
    await client.query("COMMIT");
    console.log("Payout account encryption completed. Plaintext values were not printed.");
  } else {
    await client.query("ROLLBACK");
    console.log("Dry run only. Re-run with --apply after taking a database backup.");
  }
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end().catch(() => {});
}
