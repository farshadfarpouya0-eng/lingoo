import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db";
import { lessons, teacherProfiles, users } from "../src/db/schema";
import { zoomMeetingIdFromUrl } from "../src/lib/zoom-api";
import { resolveTeacherLaunch } from "../src/lib/teacher-launch";
import { localDatabaseConfigured } from "../src/lib/runtime-policy";

const MEET = "https://meet.google.com/abc-defg-hij";
const ZOOM = "https://zoom.us/j/1234567890?pwd=abc";
const HOST = "https://zoom.us/s/1234567890?zak=secret-token";

test("Zoom meeting id extraction only accepts numeric room IDs", () => {
  assert.equal(zoomMeetingIdFromUrl(ZOOM), "1234567890");
  assert.equal(zoomMeetingIdFromUrl("https://us05web.zoom.us/s/9876543210?zak=x"), "9876543210");
  assert.equal(zoomMeetingIdFromUrl("https://zoom.us/my/teacher.name"), "");
  assert.equal(zoomMeetingIdFromUrl("https://evil.example/j/1234567890"), "");
});

test("teacher launch requires admin open-access for Meet and uses secret host fallback for Zoom", async () => {
  assert.equal(localDatabaseConfigured(), true);
  const suffix = randomUUID();
  const [teacher, student] = await db.insert(users).values([
    { name: "Launch teacher", email: `launch-teacher-${suffix}@example.test`, passwordHash: "fixture", role: "teacher" },
    { name: "Launch student", email: `launch-student-${suffix}@example.test`, passwordHash: "fixture", role: "student" },
  ]).returning();
  const lessonIds: number[] = [];
  try {
    await db.insert(teacherProfiles).values({ userId: teacher.id, meetUrl: MEET, zoomUrl: ZOOM, meetOpenAccess: false, zoomHostUrl: HOST });
    await assert.rejects(resolveTeacherLaunch(teacher.id, "meet", ""), /meet_open_access/);
    await db.update(teacherProfiles).set({ meetOpenAccess: true }).where(eq(teacherProfiles.userId, teacher.id));
    const meet = await resolveTeacherLaunch(teacher.id, "meet", "");
    assert.equal(meet.url, MEET); assert.equal(meet.mode, "meet-guest");
    const zoom = await resolveTeacherLaunch(teacher.id, "zoom", "");
    assert.equal(zoom.url, HOST); assert.equal(zoom.mode, "zoom-fallback");
    const [lesson] = await db.insert(lessons).values({ teacherId: teacher.id, studentId: student.id, startAt: new Date(Date.now() - 60_000), duration: 30, status: "confirmed", price: 0, platform: "meet", meetingUrl: "https://meet.google.com/xyz-abcd-efg", topic: "Launch test" }).returning();
    lessonIds.push(lesson.id);
    const override = await resolveTeacherLaunch(teacher.id, "meet", lesson.meetingUrl);
    assert.equal(override.url, "https://meet.google.com/xyz-abcd-efg");
  } finally {
    if (lessonIds.length) await db.delete(lessons).where(inArray(lessons.id, lessonIds));
    await db.delete(users).where(inArray(users.id, [teacher.id, student.id]));
  }
});
test.after(async () => { await pool.end(); });
