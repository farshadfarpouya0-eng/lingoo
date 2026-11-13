import test from "node:test";
import assert from "node:assert/strict";
import { buildSlots, isBookingLeadTimeOpen, zonedParts, zonedLocalToUtc } from "../src/lib/time";
import type { TeacherAvail } from "../src/lib/time";

const TEACHER_TZ = "UTC";
const STUDENT_TZ = "Asia/Tehran"; // UTC+03:30, no DST
const locale = "en-US";
const studentLabel = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone: STUDENT_TZ, hour: "2-digit", minute: "2-digit", hour12: false, hourCycle: "h23" }).format(new Date(iso));
const teacherLabel = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone: TEACHER_TZ, hour: "2-digit", minute: "2-digit", hour12: false, hourCycle: "h23" }).format(new Date(iso));

/** Student at 09:00 local (UTC+3:30) = 05:30 UTC. Teacher works 09:00-21:00 UTC. */
const avail: TeacherAvail = { startHour: 9, endHour: 21, tzOffset: 0, timeZone: TEACHER_TZ, workDays: "0,1,2,3,4,5,6", weeklySlots: null, blocked: [] };

test("the same instant renders as different local times for teacher and student", () => {
  // The reported bug: a student in Tehran read a teacher-zone "07:00" label as
  // their own 7 AM and concluded the slot was in the past.
  const slot = zonedLocalToUtc("2026-11-11", "07:00", TEACHER_TZ)!; // 07:00 UTC tomorrow
  const studentNow = zonedLocalToUtc("2026-11-10", "09:00", STUDENT_TZ)!; // 09:00 Tehran today
  assert.equal(teacherLabel(slot.toISOString()), "07:00");
  assert.equal(studentLabel(slot.toISOString()), "10:30");
  assert.ok(slot.getTime() - studentNow.getTime() > 30 * 60_000, "the slot is genuinely in the future");
  // Labels must never be reused across zones.
  assert.notEqual(studentLabel(slot.toISOString()), teacherLabel(slot.toISOString()));
});

test("buildSlots only returns instants that are still bookable at render time", () => {
  const realNow = Date.now();
  const days = buildSlots("en", avail, new Set<number>(), 50);
  const slots = days.flatMap(day => day.slots);
  assert.ok(slots.length > 0, "the teacher has future availability");
  for (const slot of slots) {
    assert.ok(slot.iso.endsWith("Z"), "slots are exchanged as absolute UTC instants");
    assert.ok(isBookingLeadTimeOpen(slot.iso, realNow), "server-side lead-time filter is applied");
  }
});

test("past teacher slots are excluded from the bookable list entirely", () => {
  const now = zonedLocalToUtc("2026-11-10", "05:30", STUDENT_TZ)!;
  const days = buildSlots("en", avail, new Set<number>(), 50);
  const slots = days.flatMap(day => day.slots);
  assert.ok(slots.length > 0);
  for (const slot of slots) {
    assert.ok(isBookingLeadTimeOpen(slot.iso, now.getTime()), `slot ${slot.iso} must be at least 30 minutes away`);
    assert.ok(new Date(slot.iso).getTime() > now.getTime(), "no past instant may be offered");
  }
  assert.equal(slots.some(slot => teacherLabel(slot.iso) === "04:00"), false, "04:00 UTC is already past");
});

test("a slot exactly 30 minutes away stays bookable and 29 minutes is refused", () => {
  const base = zonedLocalToUtc("2026-11-10", "06:30", TEACHER_TZ)!;
  assert.equal(isBookingLeadTimeOpen(new Date(base.getTime() + 30 * 60_000), base.getTime()), true);
  assert.equal(isBookingLeadTimeOpen(new Date(base.getTime() + 29 * 60_000), base.getTime()), false);
});

test("DST and offset conversions stay exact for a half-hour zone", () => {
  const parts = zonedParts(new Date("2026-11-10T05:30:00Z"), STUDENT_TZ);
  assert.equal(parts.hour, 9); assert.equal(parts.minute, 0); assert.equal(parts.day, 10);
  const utc = zonedLocalToUtc("2026-11-10", "09:00", STUDENT_TZ);
  assert.equal(utc?.toISOString(), "2026-11-10T05:30:00.000Z");
});
