import "dotenv/config";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { classroomSecret, demoDataEnabled, demoPaymentsEnabled, localDatabaseConfigured } from "../src/lib/runtime-policy";

const saved = { ...process.env };
try {
  process.env.DATABASE_URL = "postgresql://example:example@127.0.0.1:5432/app_db";
  delete process.env.ENABLE_DEMO_DATA;
  delete process.env.ENABLE_DEMO_PAYMENTS;
  delete process.env.SESSION_SECRET;
  assert.equal(localDatabaseConfigured(), true);
  assert.equal(demoDataEnabled(), true);
  assert.equal(demoPaymentsEnabled(), true);
  assert.ok(classroomSecret());
  console.log("PASS local preview policy remains functional");
  process.env.DATABASE_URL = "postgresql://example:example@db.test.invalid:5432/lingorain?sslmode=require";
  assert.equal(localDatabaseConfigured(), false);
  assert.equal(demoDataEnabled(), false);
  assert.equal(demoPaymentsEnabled(), false);
  assert.throws(() => classroomSecret(), /SESSION_SECRET/);
  console.log("PASS hosted DB disables known-password demo accounts and fake credit by default");
  process.env.SESSION_SECRET = "test-only-not-a-real-secret-".repeat(3);
  assert.equal(classroomSecret(), process.env.SESSION_SECRET);
  process.env.ENABLE_DEMO_DATA = "true";
  assert.equal(demoDataEnabled(), true);
  process.env.ENABLE_DEMO_DATA = "false";
  assert.equal(demoDataEnabled(), false);
  console.log("PASS stable classroom secret and explicit isolated-demo overrides");

  for (const provider of ["netlify", "vercel"]) {
    const env = { ...saved,
      DATABASE_URL: "postgresql://example:test-only-database-password@db.test.invalid:5432/lingorain?sslmode=require",
      SESSION_SECRET: "test-only-classroom-secret-".repeat(3), APP_URL: `https://lingorain-deploy-test.${provider === "vercel" ? "vercel.app" : "netlify.app"}`,
      ENABLE_DEMO_DATA: "false", ENABLE_DEMO_PAYMENTS: "false",
      STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "", JITSI_DOMAIN: "classroom.test.invalid",
    };
    const preflight = (override: Record<string, string> = {}) => spawnSync(process.execPath, [`scripts/check-${provider}-env.mjs`], { env: { ...env, ...override }, encoding: "utf8" });
    const valid = preflight();
    assert.equal(valid.status, 0, valid.stderr);
    assert.ok(!`${valid.stdout}${valid.stderr}`.includes(env.SESSION_SECRET));
    assert.ok(!`${valid.stdout}${valid.stderr}`.includes("test-only-database-password"));
    console.log(`PASS ${provider} preflight accepts valid hosted settings without printing secrets`);
    const neonDirect = preflight({ DATABASE_URL: "postgresql://example:test-only-database-password@ep-lingorain-test.ap-southeast-1.aws.neon.tech/lingorain?sslmode=require" });
    assert.equal(neonDirect.status, 0);
    assert.ok(neonDirect.stderr.includes("direct Neon endpoint"));
    assert.ok(!neonDirect.stderr.includes("test-only-database-password"));
    const neonPooled = preflight({ DATABASE_URL: "postgresql://example:test-only-database-password@ep-lingorain-test-pooler.ap-southeast-1.aws.neon.tech/lingorain?sslmode=require" });
    assert.equal(neonPooled.status, 0);
    assert.ok(!neonPooled.stderr.includes("direct Neon endpoint"));
    console.log(`PASS ${provider} recommends pooled Neon app connections without exposing credentials`);
    assert.notEqual(preflight({ DATABASE_URL: "postgresql://example:example@127.0.0.1:5432/lingorain" }).status, 0);
    assert.notEqual(preflight({ SESSION_SECRET: "too-short" }).status, 0);
    assert.notEqual(preflight({ APP_URL: "http://unsafe.example.com" }).status, 0);
    assert.notEqual(preflight({ STRIPE_SECRET_KEY: "test-only" }).status, 0);
    assert.notEqual(preflight({ JITSI_DOMAIN: "https://classroom.example.com/path" }).status, 0);
    console.log(`PASS ${provider} rejects local databases, weak secrets and incomplete provider settings`);
  }
  const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8")) as { framework: string; regions: string[]; buildCommand: string };
  assert.equal(vercelConfig.framework, "nextjs");
  assert.deepEqual(vercelConfig.regions, ["sin1"]);
  assert.equal(vercelConfig.buildCommand, "node scripts/check-vercel-env.mjs && npm run build");
  console.log("PASS Vercel Next.js build configuration and Singapore function placement");
  console.log("All deployment policy tests passed. External hosting/database provisioning is not performed by these tests.");
} finally {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
}
