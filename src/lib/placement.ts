import { and, desc, eq, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { assessments, teacherProfiles, users } from "@/db/schema";

/** The student's most recent assessment, if any. */
export async function getLatestAssessment(studentId: number) {
  const [row] = await db.select().from(assessments)
    .where(eq(assessments.studentId, studentId))
    .orderBy(desc(assessments.createdAt)).limit(1);
  return row ?? null;
}

/** The student's most recent completed assessment (recommendations available). */
export async function getLatestCompletedAssessment(studentId: number) {
  const [row] = await db.select().from(assessments)
    .where(and(eq(assessments.studentId, studentId), eq(assessments.status, "completed")))
    .orderBy(desc(assessments.createdAt)).limit(1);
  return row ?? null;
}

export { CEFR_LEVELS, GOALS, PLACEMENT_QUESTIONS, gradePlacement } from "./placement-questions";
export type { CefrLevel, PlacementQuestion } from "./placement-questions";
import { CEFR_LEVELS, type CefrLevel } from "./placement-questions";

export type MatchReason = "level" | "nearLevel" | "goal" | "kids" | "language" | "topRated";

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
      if (tr.introVideoUrl) score += 6;

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
    .where(inArray(users.id, ids));
  const byId = new Map(rows.map(r => [r.id, r]));
  return ids.map(id => byId.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
}
