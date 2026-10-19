import dotenv from "dotenv";
import { spawn } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

dotenv.config({ quiet: true });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 3400;
const ttl = 4 * 60 * 60 * 1000;
const statusFile = path.join(os.tmpdir(), "lingorain-shared-preview.json");
let dbHost = "";
try { dbHost = new URL(process.env.DATABASE_URL || "").hostname; } catch { /* Fail closed below. */ }
if (!(process.env.E2B_SANDBOX || process.env.E2B_SANDBOX_ID) || !["localhost", "127.0.0.1", "[::1]", "::1"].includes(dbHost)) {
  throw new Error("Share only a disposable sandbox demo with local test data. Use an authorised deployment for a real site.");
}
const health = await fetch("http://127.0.0.1:3000/api/health", { signal: AbortSignal.timeout(15000) });
if (!health.ok || (await health.json()).ok !== true) throw new Error("The managed preview is not ready. Start it and pass schema health before sharing.");

const binary = path.join(os.tmpdir(), "lingorain-cloudflared");
try { await access(binary); }
catch {
  const response = await fetch("https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64", { signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`Could not prepare the official tunnel executable: ${response.status}`);
  await writeFile(binary, Buffer.from(await response.arrayBuffer()), { mode: 0o700 });
  await chmod(binary, 0o700);
}
await mkdir(path.join(root, "artifacts"), { recursive: true });
const proxy = spawn(process.execPath, [path.join(root, "scripts/preview-access-proxy.mjs")], { cwd: root, env: { ...process.env, PREVIEW_PROXY_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
proxy.stdout.on("data", data => process.stdout.write(data));
proxy.stderr.on("data", data => process.stderr.write(data));
await new Promise(resolve => setTimeout(resolve, 800));
if (proxy.exitCode !== null) throw new Error("Temporary public-preview proxy did not start.");
let url = "";
let text = "";
const tunnel = spawn(binary, ["tunnel", "--url", `http://127.0.0.1:${port}`, "--protocol", "http2", "--no-autoupdate"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
const processOutput = data => {
  const chunk = data.toString();
  text = (text + chunk).slice(-24000);
  if (!url) {
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      url = match[0];
      void writeFile(statusFile, JSON.stringify({ url, createdAt: new Date().toISOString(), temporary: true, lifetimeLimitHours: 4 }, null, 2));
      console.log(`PUBLIC_PREVIEW_URL=${url}`);
      console.log("This address has no builder-session login requirement. It is temporary, NOT a permanent deployment. Verify pages and guest browsers before sharing.");
    }
  }
  if (/Registered tunnel connection|ERR/.test(chunk)) process.stdout.write(chunk);
};
tunnel.stdout.on("data", processOutput);
tunnel.stderr.on("data", processOutput);
let stopping = false;
const stop = code => {
  if (stopping) return;
  stopping = true;
  proxy.kill("SIGTERM");
  tunnel.kill("SIGTERM");
  setTimeout(() => { proxy.kill("SIGKILL"); tunnel.kill("SIGKILL"); process.exit(code); }, 2000);
};
proxy.on("error", () => stop(1));
tunnel.on("error", () => stop(1));
proxy.on("exit", () => { if (!stopping) stop(1); });
tunnel.on("exit", () => { if (!stopping) stop(1); });
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));
setTimeout(() => { console.log("Temporary sharing window ended."); stop(0); }, ttl);
setTimeout(() => { if (!url) { console.error("No public sharing URL became available."); stop(1); } }, 90000).unref();
