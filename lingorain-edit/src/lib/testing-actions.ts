"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { lessons, teacherProfiles, users } from "@/db/schema";
import { createSession, getUser } from "@/lib/auth";

type R = { ok?: boolean; error?: string; id?: number };

const TAG = "[TEST]";

function impersonationAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_ADMIN_IMPERSONATION === "true";
}

export async function createTestLesson(prev: R, formData: FormData): Promise<R> {
  const me = await getUser();
  if (!me || me.role !== "admin") return { ok: false, error: "forbidden" };

  const studentId = Number(formData.get("studentId"));
  const teacherId = Number(formData.get("teacherId"));
  const duration = Math.min(180, Math.max(15, Number(formData.get("duration")) || 60));
  const platform = String(formData.get("platform") || "lingo");
  const timing = String(formData.get("timing") || "now");

  if (!Number.isInteger(studentId) || !Number.isInteger(teacherId) || studentId === teacherId) {
    return { ok: false, error: "invalid" };
  }
  if (!["lingo", "meet", "zoom"].includes(platform)) return { ok: false, error: "invalid" };

  const [s] = await db.select({ id: users.id }).from(users).where(eq(users.id, studentId)).limit(1);
  const [t] = await db.select({ id: teacherProfiles.userId }).from(teacherProfiles).where(eq(teacherProfiles.userId, teacherId)).limit(1);
  if (!s || !t) return { ok: false, error: "invalid" };

  const offset = timing === "in2h" ? 2 * 60 * 60_000 : timing === "tomorrow" ? 24 * 60 * 60_000 : -5 * 60_000;
  const startAt = new Date(Date.now() + offset);

  const [row] = await db.insert(lessons).values({
    studentId,
    teacherId,
    startAt,
    duration,
    status: "confirmed",
    price: 1500,
    trial: false,
    topic: `${TAG} Sandbox lesson`,
    classType: "private",
    capacity: 1,
    platform,
    meetingUrl: "",
    platformRevision: 1,
    platformUpdatedAt: new Date(),
  }).returning({ id: lessons.id });

  revalidatePath("/admin/testing");
  return { ok: true, id: row.id };
}

async function touch(id: number) {
  revalidatePath("/admin/testing");
  revalidatePath(`/classroom/${id}`);
}

async function adminOnly() {
  const me = await getUser();
  if (!me || me.role !== "admin") return null;
  return me;
}

export async function testLessonStartNow(prev: R, formData: FormData): Promise<R> {
  if (!await adminOnly()) return { ok: false, error: "forbidden" };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { ok: false, error: "invalid" };
  await db.update(lessons).set({ startAt: new Date(Date.now() - 5 * 60_000), status: "confirmed" }).where(eq(lessons.id, id));
  await touch(id);
  return { ok: true };
}

export async function testLessonDelay(prev: R, formData: FormData): Promise<R> {
  if (!await adminOnly()) return { ok: false, error: "forbidden" };
  const id = Number(formData.get("id"));
  const minutes = Math.max(5, Number(formData.get("minutes")) || 30);
  if (!Number.isInteger(id)) return { ok: false, error: "invalid" };
  await db.update(lessons).set({ startAt: new Date(Date.now() + minutes * 60_000) }).where(eq(lessons.id, id));
  await touch(id);
  return { ok: true };
}

export async function testLessonEndNow(prev: R, formData: FormData): Promise<R> {
  if (!await adminOnly()) return { ok: false, error: "forbidden" };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { ok: false, error: "invalid" };
  await db.update(lessons).set({ startAt: new Date(Date.now() - 6 * 60 * 60_000), status: "completed" }).where(eq(lessons.id, id));
  await touch(id);
  return { ok: true };
}

export async function testLessonDelete(prev: R, formData: FormData): Promise<R> {
  if (!await adminOnly()) return { ok: false, error: "forbidden" };
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { ok: false, error: "invalid" };
  await db.delete(lessons).where(eq(lessons.id, id));
  await touch(id);
  return { ok: true };
}

export async function switchToUser(prev: R, formData: FormData): Promise<R> {
  const me = await getUser();
  if (!me || me.role !== "admin") return { ok: false, error: "forbidden" };
  if (!impersonationAllowed()) return { ok: false, error: "disabled" };

  const targetId = Number(formData.get("id"));
  if (!Number.isInteger(targetId) || targetId === me.id) return { ok: false, error: "invalid" };

  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1);
  if (!target) return { ok: false, error: "invalid" };

  const jar = await cookies();
  const currentToken = jar.get("sid")?.value;
  if (currentToken) {
    jar.set("admin_sid", currentToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 6 * 3600,
    });
  }
  await createSession(targetId);
  return { ok: true };
}

export async function switchBackToAdmin(): Promise<{ ok: boolean }> {
  const jar = await cookies();
  const adminToken = jar.get("admin_sid")?.value;
  if (!adminToken) return { ok: false };
  jar.set("sid", adminToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 14 * 86400,
  });
  jar.delete("admin_sid");
  return { ok: true };
}