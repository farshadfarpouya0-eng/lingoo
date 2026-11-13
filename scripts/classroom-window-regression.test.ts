import assert from "node:assert/strict";
import { test } from "node:test";
import { classroomPhase, studentClassroomOpen } from "../src/lib/classroom-window";

const start = Date.UTC(2026, 10, 15, 14, 0);
const confirmed = { status: "confirmed", startAt: new Date(start), duration: 50, platform: "lingo" };
const phase = (role: "student" | "teacher", now: number, status = "confirmed") => classroomPhase({ ...confirmed, status }, role, now);

test("reservation stays pending for tutor and learner even inside the entry window", () => {
  for (const role of ["student", "teacher"] as const) {
    for (const now of [start - 2 * 3600_000, start - 1, start, start + 10 * 60_000]) {
      assert.equal(phase(role, now, "pending"), "pending");
    }
  }
  assert.equal(studentClassroomOpen({ ...confirmed, status: "pending" }, start), false);
});

test("tutor enters exactly 30 minutes before; student exactly 10 minutes before", () => {
  assert.equal(phase("teacher", start - 30 * 60_000 - 1), "early");
  assert.equal(phase("teacher", start - 30 * 60_000), "open");
  assert.equal(phase("student", start - 10 * 60_000 - 1), "early");
  assert.equal(phase("student", start - 10 * 60_000), "open");
  assert.equal(studentClassroomOpen(confirmed, start - 10 * 60_000 - 1), false);
  assert.equal(studentClassroomOpen(confirmed, start - 10 * 60_000), true);
});

test("confirmed booking without a selected platform never offers a student classroom link", () => {
  for (const now of [start - 9 * 60_000, start + 1]) {
    assert.equal(studentClassroomOpen({ ...confirmed, platform: "undecided" }, now), false);
  }
});

test("cancelled and completed classes stay closed; end plus 15 minutes is closed", () => {
  for (const role of ["student", "teacher"] as const) {
    assert.equal(phase(role, start + 1, "cancelled"), "closed");
    assert.equal(phase(role, start + 1, "completed"), "closed");
    assert.equal(phase(role, start + 65 * 60_000 - 1), "open");
    assert.equal(phase(role, start + 65 * 60_000), "closed");
  }
});
