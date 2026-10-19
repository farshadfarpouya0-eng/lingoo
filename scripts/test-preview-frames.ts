import assert from "node:assert/strict";
import { embeddedSandboxPreview } from "../src/lib/preview-frame-policy";

const local = "postgresql://test:test@127.0.0.1:5432/app_db";
const hosted = "postgresql://test:test@db.example.invalid:5432/lingorain?sslmode=require";
assert.equal(embeddedSandboxPreview({ DATABASE_URL: hosted }), false);
assert.equal(embeddedSandboxPreview({ DATABASE_URL: local }), false);
assert.equal(embeddedSandboxPreview({ E2B_SANDBOX: "1", DATABASE_URL: hosted }), false);
assert.equal(embeddedSandboxPreview({ E2B_SANDBOX: "1", DATABASE_URL: local }), true);
assert.equal(embeddedSandboxPreview({ E2B_SANDBOX_ID: "test-preview", DATABASE_URL: local }), true);
assert.equal(embeddedSandboxPreview({ E2B_SANDBOX: "1", DATABASE_URL: "invalid" }), false);
console.log("PASS disposable builder previews may be embedded; hosted deployments keep frame protections.");
