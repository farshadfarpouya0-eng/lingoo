import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../src/db";
import { lessonPlatformEvents, lessons, teacherProfiles, users } from "../src/db/schema";
import { validMeetingLink } from "../src/lib/meeting-links";
import { assignedTeacherLinks, chooseClassroom, classroomSnapshot } from "../src/lib/room-service";
import { localDatabaseConfigured } from "../src/lib/runtime-policy";

const MEET = "https://meet.google.com/abc-defg-hij";
const ZOOM = "https://us05web.zoom.us/j/1234567890?pwd=AbC123";

test("meeting link validation accepts real rooms and rejects lookalikes", () => {
  assert.equal(validMeetingLink("meet", MEET), MEET);
  assert.equal(validMeetingLink("zoom", ZOOM), ZOOM);
  assert.equal(validMeetingLink("zoom", "https://zoom.us/my/teacher.name"), "https://zoom.us/my/teacher.name");
  for (const bad of ["http://meet.google.com/abc-defg-hij", "https://meet.google.com.evil.example/abc-defg-hij", "https://evil.example/j/123", "https://user:pw@zoom.us/j/1", "not a url"]) {
    assert.equal(validMeetingLink("meet", bad), ""); assert.equal(validMeetingLink("zoom", bad), "");
  }
  assert.equal(validMeetingLink("meet", ZOOM), "", "a Zoom link is not a Meet room");
});

test("admin-assigned rooms drive Meet/Zoom classrooms without tutor input", async () => {
  assert.equal(localDatabaseConfigured(), true, "Use only the disposable local database.");
  const suffix = randomUUID();
  const [teacher, student] = await db.insert(users).values([
    { name: "Links teacher", email: `links-teacher-${suffix}@example.test`, passwordHash: "fixture", role: "teacher" },
    { name: "Links student", email: `links-student-${suffix}@example.test`, passwordHash: "fixture", role: "student" },
  ]).returning();
  const lessonIds: number[] = [];
  try {
    await db.insert(teacherProfiles).values({ userId: teacher.id, meetUrl: MEET, zoomUrl: "" });
    assert.deepEqual(await assignedTeacherLinks(teacher.id), { meet: MEET, zoom: "" });
    const [lesson] = await db.insert(lessons).values({ teacherId: teacher.id, studentId: student.id, startAt: new Date(Date.now() - 2 * 60_000), duration: 30, status: "confirmed", price: 0, topic: "Assigned room test" }).returning();
    lessonIds.push(lesson.id);

    // Tutor picks Meet with no pasted link: allowed because an admin room exists.
    await chooseClassroom(teacher.id, lesson.id, "meet", "");
    let snap = await classroomSnapshot(student.id, lesson.id);
    assert.equal(snap.platform, "meet"); assert.equal(snap.joinUrl, MEET, "student joins the admin-assigned room");

    // Admin changes the room later: open lessons follow it automatically.
    const NEW_MEET = "https://meet.google.com/xyz-abcd-efg";
    await db.update(teacherProfiles).set({ meetUrl: NEW_MEET }).where(eq(teacherProfiles.userId, teacher.id));
    snap = await classroomSnapshot(student.id, lesson.id);
    assert.equal(snap.joinUrl, NEW_MEET);

    // A lesson-specific tutor link overrides the assigned room.
    const OVERRIDE = "https://meet.google.com/ovr-ride-abc";
    await chooseClassroom(teacher.id, lesson.id, "meet", OVERRIDE);
    assert.equal((await classroomSnapshot(student.id, lesson.id)).joinUrl, OVERRIDE);

    // Zoom has no assigned room: a link is still required. Daily is retired for new selections.
    await assert.rejects(chooseClassroom(teacher.id, lesson.id, "zoom", ""), /link/);
    await assert.rejects(chooseClassroom(teacher.id, lesson.id, "daily", ""), /platform/);
    // Invalid stored data is never served as a join link.
    await db.update(teacherProfiles).set({ meetUrl: "https://evil.example/abc-defg-hij" }).where(eq(teacherProfiles.userId, teacher.id));
    await chooseClassroom(teacher.id, lesson.id, "lingo", "");
    await assert.rejects(chooseClassroom(teacher.id, lesson.id, "meet", ""), /link/);
  } finally {
    if (lessonIds.length) {
      await db.delete(lessonPlatformEvents).where(inArray(lessonPlatformEvents.lessonId, lessonIds));
      await db.delete(lessons).where(inArray(lessons.id, lessonIds));
    }
    await db.delete(users).where(inArray(users.id, [teacher.id, student.id]));
  }
});
test.after(async () => { await pool.end(); });
