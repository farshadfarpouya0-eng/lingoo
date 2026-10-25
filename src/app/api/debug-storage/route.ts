import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getIntegrationConfig } from "@/lib/integration-config";

export const dynamic = "force-dynamic";

/** Admin-only storage diagnostics — shows exactly what the server sees. */
export async function GET() {
  const user = await getUser();
  if (!user || user.role !== "admin") return NextResponse.json({ error: "admin only" }, { status: 403 });

  const c = await getIntegrationConfig();
  const url = c.storage.url;
  const key = c.storage.serviceRoleKey;
  const bucket = c.storage.bucket;

  let role = "no-key";
  if (key.startsWith("eyJ")) {
    try { role = JSON.parse(Buffer.from(key.split(".")[1], "base64").toString()).role || "unknown"; }
    catch { role = "unreadable-jwt"; }
  } else if (key) {
    role = "not-a-jwt (starts: " + key.slice(0, 8) + ")";
  }

  const result: Record<string, unknown> = {
    sees_url: url || "(EMPTY)",
    sees_bucket: bucket,
    key_present: Boolean(key),
    key_length: key.length,
    key_role: role,
    env_SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    env_SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  if (url && key) {
    const h = { Authorization: "Bearer " + key, apikey: key };
    try {
      const list = await fetch(url + "/storage/v1/bucket", { headers: h, cache: "no-store" });
      result.list_buckets_status = list.status;
      result.list_buckets_body = (await list.text()).slice(0, 400);
      const one = await fetch(url + "/storage/v1/bucket/" + encodeURIComponent(bucket), { headers: h, cache: "no-store" });
      result.check_bucket_status = one.status;
      result.check_bucket_body = (await one.text()).slice(0, 400);
    } catch (e) {
      result.fetch_error = e instanceof Error ? e.message : "unknown";
    }
  }

  return NextResponse.json(result);
}
