import { and, desc, eq, inArray, lte, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { assessments, teacherProfiles, users } from "@/db/schema";
import { isAccountSuspended } from "./account-status";

type Reader = Pick<typeof db, "select">;
type SelectionRecord = Pick<typeof assessments.$inferSelect, "status" | "level" | "selectedTeacherId" | "recommendedIds">;

/** One current placement for display, choosing a match, purchases and bookings.
 * A newer pending evaluation is not permission to reuse an older shortlist.
 * A cancelled evaluation is ignored (it never produced a result).
 */
export async function getLatestAssessment(studentId: number, reader: Reader = db) {
  const [row] = await reader.select().from(assessments)
    .where(and(eq(assessments.studentId, studentId), ne(assessments.status, "cancelled")))
    .orderBy(desc(assessments.createdAt), desc(assessments.id)).limit(1);
  return row ?? null;
}

export async function getLatestCompletedAssessment(studentId: number, reader: Reader = db) {
  const row = await getLatestAssessment(studentId, reader);
  return row?.status === "completed" && row.level ? row : null;
}

export function shortlistIds(row: SelectionRecord | null): number[] {
  if (row?.status !== "completed" || !row.level || !Array.isArray(row.recommendedIds)) return [];
  return [...new Set(row.recommendedIds.filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0))].slice(0, 3);
}

export function selectedPlacementTutor(row: SelectionRecord | null): number | null {
  const id = row?.selectedTeacherId;
  return id && shortlistIds(row).includes(id) ? id : null;
}

/** Check inside the payment/booking transaction, after locking the student.
 * A teacherId sent by the browser confirms intent; it does not grant access.
 */
export async function requirePlacementTutor(reader: Reader, studentId: number, teacherId: number) {
  const current = await getLatestAssessment(studentId, reader);
  if (selectedPlacementTutor(current) !== teacherId) throw new Error("placement_required");
}

/** The results screen is the only writer of selectedTeacherId. Stale pages,
 * another learner's result, unavailable tutors and non-matches cannot assign a tutor.
 */
export async function confirmPlacementTutor(studentId: number, assessmentId: number, teacherId: number) {
  if (![studentId, assessmentId, teacherId].every(id => Number.isSafeInteger(id) && id > 0)) return false;
  return db.transaction(async tx => {
    const [student] = await tx.select({ role: users.role, suspended: users.suspended, until: users.suspendedUntil })
      .from(users).where(eq(users.id, studentId)).for("update");
    if (student?.role !== "student" || isAccountSuspended(student.suspended, student.until)) return false;
    const current = await getLatestAssessment(studentId, tx);
    if (current?.id !== assessmentId || !shortlistIds(current).includes(teacherId)) return false;
    const [tutor] = await tx.select({ id: users.id }).from(teacherProfiles).innerJoin(users, eq(users.id, teacherProfiles.userId))
      .where(and(eq(users.id, teacherId), eq(users.role, "teacher"), eq(teacherProfiles.active, true),
        or(eq(users.suspended, false), lte(users.suspendedUntil, new Date())))).for("share");
    if (!tutor) return false;
    const saved = await tx.update(assessments).set({ selectedTeacherId: tutor.id, updatedAt: new Date() })
      .where(and(eq(assessments.id, current.id), eq(assessments.studentId, studentId), eq(assessments.status, "completed")))
      .returning({ id: assessments.id });
    return saved.length === 1;
  });
}

export { CEFR_LEVELS, GOALS, PLACEMENT_QUESTIONS, gradePlacement } from "./placement-questions";
export type { CefrLevel, PlacementQuestion } from "./placement-questions";
import { CEFR_LEVELS, type CefrLevel } from "./placement-questions";

export type MatchReason = "level" | "nearLevel" | "goal" | "kids" | "language" | "topRated" | "introVideo";

export type TeacherMatch = {
  id: number;
  score: number;
  reasons: MatchReason[];
};

type TeacherRow = {
  id: number;
  rating: number;
  reviewsCount: number;
  levels: string;
  tags: string;
  speaks: string;
  introVideoUrl?: string;
};

function parseList(v: string): string[] {
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

/** Scores every active tutor and returns the best matches for a student. */
export function rankTeachers(
  teachers: TeacherRow[],
  input: { level: CefrLevel; goal: string; audience: string; nativeLang?: string | null },
): TeacherMatch[] {
  const levelIdx = CEFR_LEVELS.indexOf(input.level);
  return teachers
    .map((tr): TeacherMatch => {
      let score = 0;
      const reasons: MatchReason[] = [];
      const levels = parseList(tr.levels);
      const tags = parseList(tr.tags);
      const speaks = tr.speaks.toLowerCase();

      if (levels.length) {
        const idxs = levels.map(l => CEFR_LEVELS.indexOf(l as CefrLevel)).filter(i => i >= 0);
        if (idxs.includes(levelIdx)) { score += 40; reasons.push("level"); }
        else if (idxs.some(i => Math.abs(i - levelIdx) === 1)) { score += 20; reasons.push("nearLevel"); }
      } else {
        score += 10; // tutor has not declared levels yet — keep them eligible
      }

      if (input.goal && tags.some(t => t.toLowerCase() === input.goal.toLowerCase())) {
        score += 30; reasons.push("goal");
      }

      const kidsTutor = tags.some(t => t.toLowerCase() === "kids");
      if (input.audience === "kids") {
        if (kidsTutor) { score += 30; reasons.push("kids"); }
        else score -= 20;
      } else if (kidsTutor && tags.length <= 2) {
        score -= 8; // kids-only tutor is a weaker fit for an adult
      }

      const nl = (input.nativeLang || "").toLowerCase();
      if ((nl === "zh" && /(mandarin|cantonese|chinese)/.test(speaks)) || (nl === "ja" && /japanese/.test(speaks))) {
        score += 15; reasons.push("language");
      }

      // Tutors who have recorded an introduction give students more to choose from.
      if (tr.introVideoUrl) { score += 6; reasons.push("introVideo"); }

      // Bayesian-ish rating nudge so proven tutors edge out brand-new ones.
      const proven = (tr.rating * tr.reviewsCount + 4.5 * 5) / (tr.reviewsCount + 5);
      score += proven;
      if (tr.reviewsCount >= 20 && tr.rating >= 4.8) reasons.push("topRated");

      return { id: tr.id, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
}

export async function recommendTeachers(input: {
  level: CefrLevel; goal: string; audience: string; nativeLang?: string | null; limit?: number;
}): Promise<TeacherMatch[]> {
  const rows = await db
    .select({
      id: users.id, rating: teacherProfiles.rating, reviewsCount: teacherProfiles.reviewsCount,
      levels: teacherProfiles.levels, tags: teacherProfiles.tags, speaks: teacherProfiles.speaks,
      introVideoUrl: teacherProfiles.introVideoUrl,
    })
    .from(teacherProfiles)
    .innerJoin(users, eq(users.id, teacherProfiles.userId))
    .where(and(
      eq(users.role, "teacher"),
      eq(teacherProfiles.active, true),
      or(eq(users.suspended, false), lte(users.suspendedUntil, new Date()))!,
    ));
  return rankTeachers(rows, input).slice(0, input.limit ?? 3);
}

/** Picks a random active tutor for a live assessment, preferring one who speaks the student's language. */
export async function pickRandomTeacher(nativeLang?: string | null): Promise<number | null> {
  const rows = await db
    .select({ id: users.id, speaks: teacherProfiles.speaks })
    .from(teacherProfiles)
    .innerJoin(users, eq(users.id, teacherProfiles.userId))
    .where(and(
      eq(users.role, "teacher"),
      eq(teacherProfiles.active, true),
      or(eq(users.suspended, false), lte(users.suspendedUntil, new Date()))!,
    ));
  if (!rows.length) return null;
  const nl = (nativeLang || "").toLowerCase();
  const speaking = rows.filter(r =>
    (nl === "zh" && /(mandarin|cantonese|chinese)/i.test(r.speaks)) ||
    (nl === "ja" && /japanese/i.test(r.speaks)));
  const pool = speaking.length ? speaking : rows;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

export async function getTeachersByIds(ids: number[]) {
  if (!ids.length) return [];
  const rows = await db
    .select({
      id: users.id, name: users.name, avatar: users.avatar,
      headline: teacherProfiles.headline, bio: teacherProfiles.bio, country: teacherProfiles.country,
      accent: teacherProfiles.accent, price: teacherProfiles.price, rating: teacherProfiles.rating,
      reviewsCount: teacherProfiles.reviewsCount, lessonsCount: teacherProfiles.lessonsCount,
      speaks: teacherProfiles.speaks, tags: teacherProfiles.tags, levels: teacherProfiles.levels,
      introVideoUrl: teacherProfiles.introVideoUrl, sampleVideoUrl: teacherProfiles.sampleVideoUrl,
      certified: teacherProfiles.certified,
    })
    .from(teacherProfiles)
    .innerJoin(users, eq(users.id, teacherProfiles.userId))
    .where(and(inArray(users.id, ids), eq(users.role, "teacher"), eq(teacherProfiles.active, true),
      or(eq(users.suspended, false), lte(users.suspendedUntil, new Date()))));
  const byId = new Map(rows.map(r => [r.id, r]));
  return ids.map(id => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
}
