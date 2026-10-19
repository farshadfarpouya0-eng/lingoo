import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { db, pool } from "../src/db";
import { managedPreviewDatabase } from "../src/db/preview-bootstrap";

// Reproduce the actual blocker: a completely fresh DB, then a Next production
// server with no manual drizzle push. Only this test's own disposable DB is removed.
async function main() {
  if (!managedPreviewDatabase()) throw new Error("This test is restricted to a managed E2B sandbox and local PostgreSQL.");
  const database = `lingorain_startup_${randomUUID().replaceAll("-", "")}`;
  const port = 3107;
  const origin = `http://127.0.0.1:${port}`;
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${database}`;
  let created = false;
  let child: ChildProcess | undefined;
  let testPool: Pool | undefined;
  let logs = "";
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    const processToStop = child;
    const exited = once(processToStop, "exit");
    processToStop.kill("SIGTERM");
    await Promise.race([exited, new Promise<void>(resolve => setTimeout(() => { processToStop.kill("SIGKILL"); resolve(); }, 5000).unref())]);
    child = undefined;
  };
  const start = async () => {
    logs = "";
    child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
      env: { ...process.env, DATABASE_URL: url.href, ENABLE_DEMO_DATA: "true", ENABLE_DEMO_PAYMENTS: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", chunk => { logs += chunk.toString(); });
    child.stderr?.on("data", chunk => { logs += chunk.toString(); });
    const deadline = Date.now() + 45000;
    let ready = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Isolated preview server exited before readiness: ${logs.slice(-1800)}`);
      try {
        const res = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000), cache: "no-store" });
        if (res.ok && (await res.json()).ok === true) { ready = true; break; }
      } catch { /* Wait for the isolated process to finish bootstrapping. */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, `Fresh server did not become schema-ready: ${logs.slice(-1800)}`);
    assert.ok(logs.includes("Startup completed before serving requests"), "Startup registration did not run");
  };
  try {
    await db.execute(sql`create database ${sql.identifier(database)}`);
    created = true;
    testPool = new Pool({ connectionString: url.href, max: 1, allowExitOnIdle: true });
    const isolated = drizzle(testPool);
    const before = await isolated.execute(sql`select count(*)::int as n from information_schema.tables where table_schema='public'`);
    assert.equal(before.rows[0].n, 0);
    await start();
    const after = await isolated.execute(sql`select count(*)::int as n from information_schema.tables where table_schema='public'`);
    assert.equal(after.rows[0].n, 12);
    const records = await isolated.execute(sql`select email,balance,created_at from users where email in ('student@demo.com','teacher@demo.com','admin@demo.com') order by email`);
    assert.equal(records.rows.length, 3);
    console.log("PASS true fresh production-server start: 0 tables → complete schema and sample accounts automatically");
    const clients: Record<string, string>[] = [
      { "user-agent": "Mozilla/5.0 Desktop Fresh Profile" },
      { "user-agent": "Mozilla/5.0 Mobile Fresh Profile", cookie: "lang=en; sid=old-unrecognized-cookie" },
    ];
    for (const headers of clients) {
      for (const [path, text] of [["/", "Find an English tutor"], ["/teachers", "Olivia Chen"], ["/login", "student@demo.com"]]) {
        const res = await fetch(`${origin}${path}`, { headers, cache: "no-store" });
        assert.equal(res.status, 200);
        const html = await res.text();
        assert.ok(html.includes(text), `${path}: missing actual content`);
        assert.ok(!/:E\{[^\n]*digest/.test(html), `${path}: React server error payload`);
      }
    }
    console.log("PASS separate fresh desktop/mobile clients and old-cookie clients see pages, not the reported error screen");
    await stop();
    await start();
    const repeated = await isolated.execute(sql`select email,balance,created_at from users where email in ('student@demo.com','teacher@demo.com','admin@demo.com') order by email`);
    assert.deepEqual(repeated.rows, records.rows);
    console.log("PASS production server restart preserves balances, existing sample accounts and creation timestamps");
    console.log("All isolated fresh-server tests passed. No existing application database was reset.");
  } finally {
    await stop();
    if (testPool) await testPool.end();
    if (created) await db.execute(sql`drop database ${sql.identifier(database)}`);
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
