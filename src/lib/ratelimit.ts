import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getIntegrationConfig } from "@/lib/integration-config";

type Bucket = { count: number; reset: number };
const g = globalThis as typeof globalThis & { __rl?: Map<string, Bucket>; __rlSweepAt?: number };
const store = (g.__rl ??= new Map<string, Bucket>());
const MAX_BUCKETS = 10_000;
const SWEEP_INTERVAL_MS = 30_000;
const REDIS_SCRIPT = "local c=redis.call('INCR',KEYS[1]); if c==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return c";

/**
 * Forwarded IP headers are user-controlled unless a trusted reverse proxy
 * overwrites them. Enable TRUST_PROXY_HEADERS only when deployment ingress
 * strips inbound values and writes authoritative headers.
 */
export async function clientIp() {
  const h = await headers();
  if (process.env.TRUST_PROXY_HEADERS !== "true") return "untrusted-proxy-disabled";
  const raw = h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || h.get("x-real-ip")?.trim();
  if (!raw || raw.length > 64 || !/^[0-9a-fA-F:.]+$/.test(raw)) return "unknown";
  return raw.toLowerCase();
}

function localHit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (now - (g.__rlSweepAt ?? 0) >= SWEEP_INTERVAL_MS || store.size >= MAX_BUCKETS) {
    for (const [k, bucket] of store) if (bucket.reset <= now) store.delete(k);
    g.__rlSweepAt = now;
  }
  const bucket = store.get(key);
  if (!bucket || bucket.reset <= now) {
    if (store.size >= MAX_BUCKETS) return false;
    store.set(key, { count: 1, reset: now + Math.max(1, windowMs) });
    return true;
  }
  bucket.count++;
  return bucket.count <= limit;
}

/** Fixed-window rate limit. Uses shared atomic Upstash Redis when configured. */
export async function hit(key: string, limit: number, windowMs: number): Promise<boolean> {
  let cfg: Awaited<ReturnType<typeof getIntegrationConfig>>["rateLimit"];
  try { cfg = (await getIntegrationConfig()).rateLimit; }
  catch { return localHit(key, limit, windowMs); }
  if (!cfg.url && !cfg.token) return localHit(key, limit, windowMs);
  // A partially configured shared limiter fails closed; otherwise one missing
  // credential could silently downgrade an intended production control.
  if (!cfg.url || !cfg.token) return false;
  const safeKey = `lingorain:rl:${createHash("sha256").update(key).digest("hex")}`;
  const endpoint = `${cfg.url}/eval/${encodeURIComponent(REDIS_SCRIPT)}/1/${encodeURIComponent(safeKey)}/${Math.max(1, Math.floor(windowMs))}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) return false;
    const payload = await response.json() as { result?: unknown; error?: unknown };
    const count = Number(payload.result);
    if (!Number.isSafeInteger(count) || count < 1) return false;
    return count <= limit;
  } catch {
    // Do not fall back to per-instance memory once shared Redis is configured.
    return false;
  }
}
