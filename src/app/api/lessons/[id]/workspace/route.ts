import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { classroomWorkspaceStates, learningMaterials, materialPurchases } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { canAccessLesson } from "@/lib/lesson-access";
import { classroomSnapshot } from "@/lib/room-service";
import { hit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

type WorkspaceState = {
  bookId?: number | null;
  page?: number;
  unitIndex?: number;
  audioTime?: number;
  audioPlaying?: boolean;
  question?: string;
  answer?: string;
  feedback?: string;
  boardStrokes?: Array<{ color: string; points: Array<{ x: number; y: number }> }>;
};

function validateState(input: unknown): WorkspaceState | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const v = input as Record<string, unknown>;
  const bookId = v.bookId === null || v.bookId === undefined || v.bookId === "" ? null : Number(v.bookId);
  const page = Number(v.page ?? 1);
  const unitIndex = Number(v.unitIndex ?? 0);
  const audioTime = Number(v.audioTime ?? 0);
  const audioPlaying = v.audioPlaying === true;
  const question = typeof v.question === "string" ? v.question : "";
  const answer = typeof v.answer === "string" ? v.answer : "";
  const feedback = typeof v.feedback === "string" ? v.feedback : "";
  if ((bookId !== null && (!Number.isSafeInteger(bookId) || bookId < 1)) || !Number.isSafeInteger(page) || page < 1 || page > 10000 || !Number.isSafeInteger(unitIndex) || unitIndex < 0 || unitIndex > 1000 || !Number.isFinite(audioTime) || audioTime < 0 || audioTime > 86400) return null;
  if (question.length > 4000 || answer.length > 12000 || feedback.length > 4000) return null;
  const rawStrokes = Array.isArray(v.boardStrokes) ? v.boardStrokes : [];
  if (rawStrokes.length > 200) return null;
  const boardStrokes: NonNullable<WorkspaceState["boardStrokes"]> = [];
  for (const raw of rawStrokes) {
    if (!raw || typeof raw !== "object") return null;
    const stroke = raw as Record<string, unknown>;
    const color = typeof stroke.color === "string" && /^#[0-9a-fA-F]{6}$/.test(stroke.color) ? stroke.color : "#0f766e";
    if (!Array.isArray(stroke.points) || stroke.points.length > 1000) return null;
    const points: Array<{x:number;y:number}> = [];
    for (const point of stroke.points) {
      if (!point || typeof point !== "object") return null;
      const p = point as Record<string, unknown>;
      const x = Number(p.x), y = Number(p.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
      points.push({x,y});
    }
    boardStrokes.push({ color, points });
  }
  return { bookId, page, unitIndex, audioTime, audioPlaying, question, answer, feedback, boardStrokes };
}

async function authorized(req: Request, id: string) {
  const user = await getUser();
  if (!user) return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const lessonId = Number(id);
  if (!Number.isSafeInteger(lessonId) || lessonId < 1 || !await canAccessLesson(lessonId, user.id)) return { response: Response.json({ error: "Not found" }, { status: 404 }) };
  try {
    const room = await classroomSnapshot(user.id, lessonId, user.name);
    if (room.state !== "open") return { response: Response.json({ error: "Workspace is available only during the class access window" }, { status: 403 }) };
  } catch { return { response: Response.json({ error: "Not found" }, { status: 404 }) }; }
  return { user, lessonId };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorized(req, (await params).id);
  if ("response" in auth) return auth.response;
  if (!await hit(`workspace-read:${auth.user.id}`, 180, 60_000)) return Response.json({ error: "Slow down" }, { status: 429 });
  const [row] = await db.select().from(classroomWorkspaceStates).where(eq(classroomWorkspaceStates.lessonId, auth.lessonId)).limit(1);
  return Response.json({ state: row?.state ?? {}, revision: row?.revision ?? 0, updatedBy: row?.updatedBy ?? null, updatedAt: row?.updatedAt?.toISOString() ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorized(req, (await params).id);
  if ("response" in auth) return auth.response;
  if (!await hit(`workspace-write:${auth.user.id}`, 120, 60_000)) return Response.json({ error: "Slow down" }, { status: 429 });
  let raw: unknown;
  try { raw = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const state = validateState(raw);
  if (!state) return Response.json({ error: "Invalid classroom state" }, { status: 400 });
  if (state.bookId !== null && state.bookId !== undefined) {
    const [material] = await db.select({ id: learningMaterials.id, published: learningMaterials.published, isFree: learningMaterials.isFree }).from(learningMaterials).where(eq(learningMaterials.id, state.bookId)).limit(1);
    if (!material || !material.published) return Response.json({ error: "Book unavailable" }, { status: 403 });
    if (!material.isFree && auth.user.role !== "teacher" && auth.user.role !== "admin") {
      const [purchase] = await db.select({ id: materialPurchases.id }).from(materialPurchases).where(and(eq(materialPurchases.materialId, state.bookId), eq(materialPurchases.userId, auth.user.id), eq(materialPurchases.status, "paid"))).limit(1);
      if (!purchase) return Response.json({ error: "Purchase required" }, { status: 403 });
    }
  }
  const expectedRevisionRaw = Number((raw as Record<string, unknown>).expectedRevision ?? 0);
  if (!Number.isSafeInteger(expectedRevisionRaw) || expectedRevisionRaw < 0) return Response.json({ error: "Invalid workspace revision" }, { status: 400 });
  const result = await db.transaction(async tx => {
    const [previous] = await tx.select().from(classroomWorkspaceStates)
      .where(eq(classroomWorkspaceStates.lessonId, auth.lessonId)).for("update").limit(1);
    const currentRevision = previous?.revision ?? 0;
    if (currentRevision !== expectedRevisionRaw) return { conflict: true as const, revision: currentRevision, state: previous?.state ?? {} };
    if (auth.user.role !== "teacher" && auth.user.role !== "admin" && previous?.state && typeof previous.state === "object") {
      const oldState = previous.state as Record<string, unknown>;
      state.feedback = typeof oldState.feedback === "string" ? oldState.feedback : "";
      state.question = typeof oldState.question === "string" ? oldState.question : state.question;
    }
    const now = new Date();
    if (!previous) {
      const [inserted] = await tx.insert(classroomWorkspaceStates).values({ lessonId: auth.lessonId, state, updatedBy: auth.user.id, updatedAt: now, revision: 1 })
        .onConflictDoNothing({ target: classroomWorkspaceStates.lessonId })
        .returning({ state: classroomWorkspaceStates.state, revision: classroomWorkspaceStates.revision, updatedBy: classroomWorkspaceStates.updatedBy, updatedAt: classroomWorkspaceStates.updatedAt });
      if (inserted) return { conflict: false as const, row: inserted };
      const [raced] = await tx.select().from(classroomWorkspaceStates).where(eq(classroomWorkspaceStates.lessonId, auth.lessonId)).limit(1);
      return { conflict: true as const, revision: raced?.revision ?? 0, state: raced?.state ?? {} };
    }
    const [updated] = await tx.update(classroomWorkspaceStates).set({ state, updatedBy: auth.user.id, updatedAt: now, revision: currentRevision + 1 })
      .where(and(eq(classroomWorkspaceStates.lessonId, auth.lessonId), eq(classroomWorkspaceStates.revision, currentRevision)))
      .returning({ state: classroomWorkspaceStates.state, revision: classroomWorkspaceStates.revision, updatedBy: classroomWorkspaceStates.updatedBy, updatedAt: classroomWorkspaceStates.updatedAt });
    return updated ? { conflict: false as const, row: updated } : { conflict: true as const, revision: currentRevision, state: previous.state };
  });
  if (result.conflict) return Response.json({ error: "workspace_conflict", revision: result.revision, state: result.state }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
  const row = result.row;
  return Response.json({ ...row, updatedAt: row.updatedAt.toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
}
