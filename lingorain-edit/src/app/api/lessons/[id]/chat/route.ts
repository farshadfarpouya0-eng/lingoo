import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { lessonChatMessages, lessons, moderationCases, users } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { hit } from "@/lib/ratelimit";
import { classroomSnapshot } from "@/lib/room-service";
import { canAccessLesson } from "@/lib/lesson-access";
import { publishPusherEvent } from "@/lib/realtime-pusher";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function participant(userId: number, lessonId: number) {
  const [lesson] = await db.select({ id: lessons.id, studentId: lessons.studentId, teacherId: lessons.teacherId })
    .from(lessons).where(eq(lessons.id, lessonId));
  return lesson && await canAccessLesson(lessonId, userId) ? lesson : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const lessonId = Number((await params).id);
  if (!Number.isSafeInteger(lessonId) || lessonId < 1) return Response.json({ error: "Not found" }, { status: 404 });
  if (!await hit(`chat-read:${user.id}`, 120, 60_000)) return Response.json({ error: "Slow down" }, { status: 429 });
  const lesson = await participant(user.id, lessonId);
  if (!lesson) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const room = await classroomSnapshot(user.id, lessonId, user.name);
    if (room.state !== "open") return Response.json({ messages: [], locked: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Not found" }, { status: 404 }); }
  const url = new URL(req.url);
  const after = Math.max(0, Number(url.searchParams.get("after") || 0));
  const rows = await db.select({ id: lessonChatMessages.id, senderId: lessonChatMessages.senderId, body: lessonChatMessages.body, createdAt: lessonChatMessages.createdAt, senderName: users.name })
    .from(lessonChatMessages).innerJoin(users, eq(users.id, lessonChatMessages.senderId))
    .where(and(eq(lessonChatMessages.lessonId, lessonId), gt(lessonChatMessages.id, Number.isSafeInteger(after) ? after : 0)))
    .orderBy(asc(lessonChatMessages.id)).limit(100);
  return Response.json({ messages: rows, locked: false }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const lessonId = Number((await params).id);
  if (!Number.isSafeInteger(lessonId) || lessonId < 1) return Response.json({ error: "Not found" }, { status: 404 });
  if (!await hit(`chat-send:${user.id}`, 30, 60_000)) return Response.json({ error: "Slow down" }, { status: 429 });
  const lesson = await participant(user.id, lessonId);
  if (!lesson) return Response.json({ error: "Not found" }, { status: 404 });
  let body = "";
  try { const data = await req.json() as { body?: unknown }; body = typeof data.body === "string" ? data.body.trim() : ""; }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (body.length < 1 || body.length > 1000) return Response.json({ error: "Message must be 1–1000 characters" }, { status: 400 });
  // Keep obvious contact details and off-platform invitations out of class chat.
  // This is a narrow rules filter, not a general-purpose content scanner.
  const contactDetails = /(?:\bhttps?:\/\/\S+|\bwww\.\S+|\b(?:wa\.me|t\.me|telegram\.me|discord\.gg|instagram\.com)\/\S+|\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b|(?<!\w)@[a-z0-9_]{4,}|(?:whats\s?app|telegram|wechat|signal|discord|instagram)\s*(?:me|id|handle|username|at)\b|(?:\+?\d[\d ().-]{7,}\d))/i;
  if (contactDetails.test(body)) {
    // Record only the event metadata, not the blocked message content, for a human review.
    // This creates a moderation queue item but does not impose an automatic sanction.
    await db.insert(moderationCases).values({ lessonId, reporterId: user.id, subjectUserId: user.id, category: "contact_sharing", description: "Automated chat rule blocked a likely off-platform contact detail or link. Review the account activity without retaining the rejected message content.", status: "open" }).catch(() => {});
    return Response.json({ error: "Sharing personal contact details or off-platform links is not allowed in class chat. The attempt was blocked and flagged for review." }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
  // Avoid accepting control characters other than ordinary whitespace.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(body)) return Response.json({ error: "Invalid message" }, { status: 400 });
  try {
    const room = await classroomSnapshot(user.id, lessonId, user.name);
    if (room.state !== "open") return Response.json({ error: "Chat is only available during the class access window" }, { status: 403 });
  } catch { return Response.json({ error: "Not found" }, { status: 404 }); }
  const [row] = await db.insert(lessonChatMessages).values({ lessonId, senderId: user.id, body }).returning({ id: lessonChatMessages.id, senderId: lessonChatMessages.senderId, body: lessonChatMessages.body, createdAt: lessonChatMessages.createdAt });
  const message = { ...row, senderName: user.name };
  // The database is the source of truth. If the optional push provider is unavailable,
  // the message remains persisted and the client falls back to authenticated polling.
  try { await publishPusherEvent(`private-lesson-${lessonId}`, "chat-message", message); } catch { /* polling fallback */ }
  return Response.json({ message }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
