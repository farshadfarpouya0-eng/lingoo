import { db } from "@/db";
import { ensurePreviewDatabase } from "@/db/preview-bootstrap";
import { sql } from "drizzle-orm";
import { isCryptoPaymentsSchemaReady } from "@/lib/crypto-schema";
import { isCryptoSettingsReady } from "@/lib/crypto-settings";
import { lessonPackages, lessonPlatformEvents, lessons, messages, payouts, reviews, sessions, teacherBlockedSlots, teacherProfiles, teacherWeeklySlots, transactions, users } from "@/db/schema";

export const dynamic = "force-dynamic";

// A database ping alone can succeed while all app tables are missing.
// Each zero-row probe is planned against a real required table/column without
// reading user data. One DB round trip checks the schema used by the preview.
const probes = [
  sql`(select ${users.id}::text from ${users} limit 0)`,
  sql`(select ${sessions.id}::text from ${sessions} limit 0)`,
  sql`(select ${teacherProfiles.userId}::text from ${teacherProfiles} limit 0)`,
  sql`(select ${teacherWeeklySlots.startMinute}::text from ${teacherWeeklySlots} limit 0)`,
  sql`(select ${teacherBlockedSlots.startAt}::text from ${teacherBlockedSlots} limit 0)`,
  sql`(select ${lessonPackages.remainingLessons}::text from ${lessonPackages} limit 0)`,
  sql`(select ${lessons.platformRevision}::text from ${lessons} limit 0)`,
  sql`(select ${lessonPlatformEvents.toPlatform}::text from ${lessonPlatformEvents} limit 0)`,
  sql`(select ${reviews.id}::text from ${reviews} limit 0)`,
  sql`(select ${messages.id}::text from ${messages} limit 0)`,
  sql`(select ${transactions.ref}::text from ${transactions} limit 0)`,
  sql`(select ${payouts.id}::text from ${payouts} limit 0)`,
];

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await ensurePreviewDatabase();
    await db.execute(sql.join(probes, sql` union all `));
    const columns = await db.execute(sql`select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name in ('teacher_profiles','lessons','users','crypto_payment_orders','crypto_network_settings','classroom_workspace_states','learning_materials','lesson_participants')`);
    const present = new Set(columns.rows.map(row => `${String(row.table_name)}.${String(row.column_name)}`));
    const optionalFeatures = {
      meetingLinks: ["teacher_profiles.meet_url", "teacher_profiles.zoom_url"].every(column => present.has(column)),
      teacherGuestLaunch: ["teacher_profiles.meet_open_access", "teacher_profiles.zoom_host_url"].every(column => present.has(column)),
      crypto: await isCryptoPaymentsSchemaReady() && await isCryptoSettingsReady(),
      workspace: present.has("classroom_workspace_states.lesson_id"),
    };
    return Response.json({ ok: true, optionalFeatures }, { headers });
  } catch {
    // Do not expose connection strings, driver errors or user records.
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
