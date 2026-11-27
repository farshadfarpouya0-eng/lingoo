export type EntryRole = "teacher" | "student";
export type ClassroomPhase = "pending" | "early" | "open" | "closed";
export const ENTRY_MINUTES: Record<EntryRole, number> = { teacher: 30, student: 10 };
/** Tutor may only end a lesson after giving a late student a 15-minute grace period. */
export const TEACHER_END_GRACE_MINUTES = 15;
export function teacherCanEndLesson(startAt: Date, now = Date.now()) {
  return Number.isFinite(startAt.getTime()) && now >= startAt.getTime() + TEACHER_END_GRACE_MINUTES * 60_000;
}

/** One source of truth for classroom entry, independent of the viewer's clock or timezone. */
export function classroomPhase(
  lesson: { status: string; startAt: Date; duration: number },
  role: EntryRole,
  now = Date.now(),
): ClassroomPhase {
  const start = lesson.startAt.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(lesson.duration) || lesson.duration <= 0) return "closed";
  if (lesson.status === "cancelled" || lesson.status === "completed" || now >= start + (lesson.duration + 15) * 60_000) return "closed";
  if (lesson.status !== "confirmed") return "pending";
  return now >= start - ENTRY_MINUTES[role] * 60_000 ? "open" : "early";
}

export function studentClassroomOpen(lesson: { status: string; startAt: Date; duration: number; platform: string }, now = Date.now()) {
  return classroomPhase(lesson, "student", now) === "open" && ["lingo", "meet", "zoom", "daily"].includes(lesson.platform);
}
