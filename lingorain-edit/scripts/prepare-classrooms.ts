import "dotenv/config";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db, pool } from "../src/db";
import { lessons } from "../src/db/schema";
async function run() {
  try {
    // Old bookings inherited Lingo automatically. Only future, unlinked,
    // unrevisioned defaults are reset; explicit new decisions are preserved.
    const rows=await db.update(lessons).set({platform:"undecided",meetingUrl:""}).where(and(
      inArray(lessons.status,["pending","confirmed"]),gt(lessons.startAt,new Date()),
      eq(lessons.platform,"lingo"),eq(lessons.meetingUrl,""),eq(lessons.platformRevision,0),isNull(lessons.platformUpdatedAt),
    )).returning({id:lessons.id});
    console.log(`Prepared ${rows.length} legacy bookings for explicit tutor selection. No tables or purchases were removed.`);
  } finally {await pool.end();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
