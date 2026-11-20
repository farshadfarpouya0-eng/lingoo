import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments, lessons, teacherProfiles } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { fetchPrivateFile, parsePrivateStorageRef, privateFileContentType } from "@/lib/private-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Streams a tutor's intro or sample video from the private bucket. Students only
 * see videos of tutors recommended to them by their placement test, or tutors
 * they already have lessons with. Range requests are forwarded so the browser
 * can seek.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required." }, { status: 401 });

  const teacherId = Number((await params).id);
  if (!Number.isSafeInteger(teacherId) || teacherId < 1) return Response.json({ error: "Not found" }, { status: 404 });
  const kind = new URL(req.url).searchParams.get("kind") === "sample" ? "sample" : "intro";

  const [profile] = await db.select({ intro: teacherProfiles.introVideoUrl, sample: teacherProfiles.sampleVideoUrl })
    .from(teacherProfiles).where(eq(teacherProfiles.userId, teacherId)).limit(1);
  const reference = kind === "sample" ? profile?.sample : profile?.intro;
  if (!reference || !parsePrivateStorageRef(reference)) return Response.json({ error: "Not found" }, { status: 404 });

  if (user.role !== "admin" && !(await canWatch(user.id, user.role, teacherId))) {
    return Response.json({ error: "Not available for your account." }, { status: 403 });
  }

  const range = req.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetchPrivateFile(reference, range);
  } catch {
    return Response.json({ error: "This video is temporarily unavailable." }, { status: 404 });
  }
  if (!upstream.ok || !upstream.body) return Response.json({ error: "Not found" }, { status: 404 });

  const headers = new Headers({
    "Content-Type": privateFileContentType(reference),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
  });
  for (const name of ["content-length", "content-range"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status === 206 ? 206 : 200, headers });
}

async function canWatch(userId: number, role: string, teacherId: number): Promise<boolean> {
  if (role === "teacher") return userId === teacherId;
  if (role !== "student") return false;

  const [lesson] = await db.select({ id: lessons.id }).from(lessons)
    .where(and(eq(lessons.studentId, userId), eq(lessons.teacherId, teacherId))).limit(1);
  if (lesson) return true;

  const mine = await db.select({ recommended: assessments.recommendedIds, assigned: assessments.assignedTeacherId })
    .from(assessments).where(eq(assessments.studentId, userId));
  return mine.some(row => row.assigned === teacherId
    || (Array.isArray(row.recommended) && (row.recommended as number[]).includes(teacherId)));
}
