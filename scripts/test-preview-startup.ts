import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getTableName, sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import { applyPreviewSchema, ensurePreviewDatabase } from "../src/db/preview-bootstrap";
import { embeddedSandboxPreview } from "../src/lib/preview-frame-policy";
import { loadPublicCatalog } from "../src/lib/catalog-recovery";
import { lessonPackages, lessonPlatformEvents, lessons, messages, payouts, reviews, sessions, teacherBlockedSlots, teacherProfiles, teacherWeeklySlots, transactions, users } from "../src/db/schema";
import { ensureSeed } from "../src/lib/seed";
const required = [users,sessions,teacherProfiles,teacherWeeklySlots,teacherBlockedSlots,lessonPackages,lessons,lessonPlatformEvents,reviews,messages,transactions,payouts];
async function main() {
  try {
    assert.equal(embeddedSandboxPreview({E2B_SANDBOX:"1",DATABASE_URL:"postgresql://x:x@db.example.invalid/app"}),false);
    assert.equal(embeddedSandboxPreview({DATABASE_URL:"postgresql://x:x@127.0.0.1/app"}),false);
    console.log("PASS automatic schema setup is limited to managed local sandbox previews");
    const schema=`startup_test_${randomUUID().replaceAll("-","")}`;
    const rollback = new Error("ROLLBACK_PREVIEW_TEST");
    try {
      await db.transaction(async tx=>{
        await tx.execute(sql`create schema ${sql.identifier(schema)}`);
        await tx.execute(sql`set local search_path to ${sql.identifier(schema)}`);
        await applyPreviewSchema(tx);
        const tables=await tx.execute(sql`select table_name from information_schema.tables where table_schema=current_schema()`);
        for(const table of required)assert.ok(tables.rows.some(r=>r.table_name===getTableName(table)));
        const [u]=await tx.insert(users).values({name:"Preserved account",email:`${schema}@test.invalid`,passwordHash:"not-for-login",balance:12345}).returning();
        await applyPreviewSchema(tx);
        const restored=await tx.execute(sql`select balance from users where id=${u.id}`);
        assert.equal(restored.rows[0].balance,12345);
        // In this throwaway schema only: simulate an older schema lacking a newly added column.
        await tx.execute(sql`alter table teacher_profiles drop column platform_default`);
        await applyPreviewSchema(tx);
        const column=await tx.execute(sql`select column_name from information_schema.columns where table_schema=current_schema() and table_name='teacher_profiles' and column_name='platform_default'`);
        assert.equal(column.rows.length,1);
        const preserved=await tx.execute(sql`select balance from users where id=${u.id}`);
        assert.equal(preserved.rows[0].balance,12345);
        throw rollback;
      });
    } catch(error) { if(error!==rollback)throw error; }
    const clean=await db.execute(sql`select schema_name from information_schema.schemata where schema_name=${schema}`);
    assert.equal(clean.rows.length,0);
    console.log("PASS fresh schema, repeat startup and additive older-schema repair preserve data (test rolled back)");
    await Promise.all([ensurePreviewDatabase(),ensurePreviewDatabase(),ensurePreviewDatabase()]);
    await Promise.all([ensureSeed(),ensureSeed(),ensureSeed()]);
    const counts=await db.execute(sql`select email,count(*)::int as n from users where email in ('student@demo.com','teacher@demo.com','admin@demo.com') group by email`);
    assert.equal(counts.rows.length,3);
    assert.ok(counts.rows.every(r=>r.n===1));
    console.log("PASS concurrent fresh runtime initialisation creates usable sample accounts once");
    const result=await loadPublicCatalog(async()=>{throw Object.assign(new Error("simulated database problem"),{code:"TEST_ONLY"});});
    assert.deepEqual(result,{items:[],unavailable:true});
    assert.deepEqual(await loadPublicCatalog(async()=>[{id:1}]),{items:[{id:1}],unavailable:false});
    console.log("PASS dynamic catalog errors do not destroy the marketing page or invent teacher data");
    console.log("All fresh-preview startup tests passed.");
  } finally { await pool.end(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
