import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/** Quick diagnostics: tells you whether the DB or the region is the bottleneck. */
export async function GET() {
  const started = Date.now();
  const raw = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL || "";
  const host = raw.split("@")[1]?.split("/")[0] || "unknown";
  const pooled = raw.includes("-pooler");

  const dbStart = Date.now();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({
      ok: true,
      dbMs: Date.now() - dbStart,
      totalMs: Date.now() - started,
      pooled,
      host,
      region: process.env.VERCEL_REGION || "local",
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "db_error",
      totalMs: Date.now() - started,
      pooled,
      host,
      region: process.env.VERCEL_REGION || "local",
    }, { status: 500 });
  }
}
