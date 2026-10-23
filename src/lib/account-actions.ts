"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teacherProfiles, users } from "@/db/schema";
import { hashPassword, requireAdmin } from "@/lib/auth";

type R = { ok?: boolean; error?: string };

const ROLES = ["student", "teacher", "admin"] as const;

const TUTOR_DEFAULTS = {
  headline: "English tutor",
  bio: "",
  country: "US",
  accent: "American",
  price: 1500,
  rating: 5,
  reviewsCount: 0,
  lessonsCount: 0,
  speaks: "English",
  tags: "Conversation",
  certified: false,
  active: false,          /* ⭐ new tutors stay hidden until approved */
};

async function ensureTutorProfile(userId: number) {
  const [tp] = await db
    .select({ id: teacherProfiles.userId })
    .from(teacherProfiles)
    .where(eq(teacherProfiles.userId, userId))
    .limit(1);
  if (!tp) await db.insert(teacherProfiles).values({ userId, ...TUTOR_DEFAULTS });
}

export async function adminResetPassword(prev: R, formData: FormData): Promise<R> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const pw = String(formData.get("password") ?? "");
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "bad_id" };
  if (pw.length < 8) return { ok: false, error: "short" };
  await db.update(users).set({ passwordHash: hashPassword(pw) }).where(eq(users.id, id));
  revalidatePath("/admin/accounts");
  return { ok: true };
}

export async function adminSetRole(prev: R, formData: FormData): Promise<R> {
  const me = await requireAdmin();
  const id = Number(formData.get("id"));
  const role = String(formData.get("role") ?? "");
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "bad_id" };
  if (!ROLES.includes(role as (typeof ROLES)[number])) return { ok: false, error: "bad_role" };
  if (id === me.id && role !== "admin") return { ok: false, error: "self" };
  await db.update(users).set({ role }).where(eq(users.id, id));
  if (role === "teacher") await ensureTutorProfile(id);
  revalidatePath("/admin/accounts");
  return { ok: true };
}

export async function adminCreateUser(prev: R, formData: FormData): Promise<R> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "student");
  if (!name || name.length > 120) return { ok: false, error: "invalid" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "invalid" };
  if (password.length < 8) return { ok: false, error: "short" };
  if (!ROLES.includes(role as (typeof ROLES)[number])) return { ok: false, error: "bad_role" };
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (exists) return { ok: false, error: "exists" };
  const [u] = await db.insert(users).values({ name, email, passwordHash: hashPassword(password), role }).returning({ id: users.id });
  if (role === "teacher") await ensureTutorProfile(u.id);
  revalidatePath("/admin/accounts");
  return { ok: true };
}

/* ⭐ Approve / suspend a tutor's public listing. */
export async function adminSetTeacherApproval(prev: R, formData: FormData): Promise<R> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const approved = String(formData.get("approved")) === "1";
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "bad_id" };

  await db.update(teacherProfiles)
    .set({ active: approved })
    .where(eq(teacherProfiles.userId, id));

  revalidatePath("/admin/tutors");
  revalidatePath("/teachers");
  return { ok: true };
}