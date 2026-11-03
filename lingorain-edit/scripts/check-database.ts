import "dotenv/config";
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import { lessonPackages, lessonPlatformEvents, lessons, messages, payouts, reviews, sessions, teacherBlockedSlots, teacherProfiles, teacherWeeklySlots, transactions, users } from "../src/db/schema";

/** Read-only check against the actual runtime URL. Never creates or resets data. */
const expectedTables = [users, sessions, teacherProfiles, teacherWeeklySlots, teacherBlockedSlots, lessonPackages, lessons, lessonPlatformEvents, reviews, messages, transactions, payouts];

async function main() {
  try {
    const results = await db.transaction(async tx => {
      await tx.execute(sql`set transaction read only`);
      await tx.execute(sql`select 1`);
      const columns = await tx.execute(sql`select table_name, column_name from information_schema.columns where table_schema = current_schema()`);
      const indexes = await tx.execute(sql`select indexname, indexdef from pg_indexes where schemaname = current_schema() and tablename = 'lessons'`);
      return { columns: columns.rows, indexes: indexes.rows };
    });
    console.log("PASS runtime PostgreSQL connection");
    const actual = new Map<string, Set<string>>();
    for (const row of results.columns) {
      const tableName = String(row.table_name);
      if (!actual.has(tableName)) actual.set(tableName, new Set());
      actual.get(tableName)!.add(String(row.column_name));
    }
    const issues: string[] = [];
    for (const table of expectedTables) {
      const tableName = getTableName(table);
      const columns = actual.get(tableName);
      if (!columns) {
        issues.push(`Missing table: ${tableName}`);
        continue;
      }
      for (const column of Object.values(getTableColumns(table))) {
        if (!columns.has(column.name)) issues.push(`Missing column: ${tableName}.${column.name}`);
      }
    }
    const bookingIndex = results.indexes.find(row => row.indexname === "lessons_slot_unique");
    if (!bookingIndex || !String(bookingIndex.indexdef).includes("UNIQUE")) issues.push("Missing unique lesson-slot index: lessons_slot_unique");
    if (issues.length) {
      for (const issue of issues) console.error(issue);
      console.error("The DB is reachable but the application schema is incomplete. Apply the reviewed schema using drizzle.netlify.config.ts, then run this read-only check again.");
      process.exitCode = 1;
      return;
    }
    console.log(`PASS ${expectedTables.length} application tables and all required columns`);
    console.log("PASS unique lesson-slot protection");
    console.log("Database readiness passed. This does not certify payments, video availability, backups or production security.");
  } catch {
    // Do not print a driver error or connection string: either may contain secrets.
    console.error("Database check failed. Check DATABASE_URL, provider TLS settings, network access and the DB role permissions. No credentials were printed.");
    process.exitCode = 1;
  } finally { await pool.end(); }
}
main();
