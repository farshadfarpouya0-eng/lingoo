import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getIntegrationConfig } from "@/lib/integration-config";
import { db } from "@/db";
import { rateLimitBuckets } from "@/db/schema";
import { lt, sql } from "drizzle-orm";

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
  const trustedIngress = process.env.TRUST_PROXY_HEADERS === "true" || process.env.VERCEL === "1";
  if (!trustedIngress) return "untrusted-proxy-disabled";
  // On Vercel, the final forwarded address is the ingress-added client IP.
  const raw = h.get("x-vercel-forwarded-for")?.split(",").at(-1)?.trim()
    || h.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    || h.get("x-real-ip")?.trim();
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
  catch { cfg = { url: "", token: "" }; }
  if (!cfg.url && !cfg.token) {
    const now = new Date();
    const safeKey = createHash("sha256").update(key).digest("hex");
    try {
      const [row] = await db.insert(rateLimitBuckets).values({ key: safeKey, count: 1, expiresAt: new Date(now.getTime() + Math.max(1, windowMs)), updatedAt: now })
        .onConflictDoUpdate({
          target: rateLimitBuckets.key,
          set: {
            count: sql`CASE WHEN ${rateLimitBuckets.expiresAt} <= ${now} THEN 1 ELSE ${rateLimitBuckets.count} + 1 END`,
            expiresAt: sql`CASE WHEN ${rateLimitBuckets.expiresAt} <= ${now} THEN ${new Date(now.getTime() + Math.max(1, windowMs))} ELSE ${rateLimitBuckets.expiresAt} END`,
            updatedAt: now,
          },
        }).returning({ count: rateLimitBuckets.count });
      // Opportunistic cleanup keeps the fallback table bounded without a separate worker.
      if ((now.getUTCMinutes() * 60 + now.getUTCSeconds()) % 97 === 0) {
        await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.expiresAt, now)).catch(() => undefined);
      }
      return Number(row?.count) > 0 && Number(row?.count) <= limit;
    } catch {
      // In production, never silently downgrade to per-instance memory.
      return process.env.NODE_ENV === "production" ? false : localHit(key, limit, windowMs);
    }
  }
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
