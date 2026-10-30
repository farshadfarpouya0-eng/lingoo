"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs, sessions, teacherProfiles, users } from "@/db/schema";
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

export async function adminResetPassword(prev: R, formData: FormData): Promise<R> {
  const admin = await requireAdmin();
  const id = Number(formData.get("id"));
  const pw = String(formData.get("password") ?? "");
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "bad_id" };
  if (pw.length < 12) return { ok: false, error: "short" };
  await db.transaction(async tx => {
    const [target] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, id)).for("update");
    if (!target) throw new Error("not_found");
    await tx.update(users).set({ passwordHash: hashPassword(pw) }).where(eq(users.id, id));
    await tx.delete(sessions).where(eq(sessions.userId, id));
    await tx.insert(adminAuditLogs).values({ adminId: admin.id, targetUserId: id, action: "admin_password_reset", reference: `user:${id}`, note: "Administrator reset account password; active sessions revoked.", metadata: { role: target.role } });
  });
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
  await db.transaction(async tx => {
    const [target] = await tx.select({ role: users.role }).from(users).where(eq(users.id, id)).for("update");
    if (!target) throw new Error("not_found");
    if (target.role !== role) {
      await tx.update(users).set({ role }).where(eq(users.id, id));
      await tx.delete(sessions).where(eq(sessions.userId, id));
      await tx.insert(adminAuditLogs).values({ adminId: me.id, targetUserId: id, action: "account_role_changed", reference: `user:${id}`, note: `Role changed from ${target.role} to ${role}; active sessions revoked.`, metadata: { previousRole: target.role, newRole: role } });
    }
    if (role === "teacher") await tx.insert(teacherProfiles).values({ userId: id, ...TUTOR_DEFAULTS }).onConflictDoNothing();
    else await tx.update(teacherProfiles).set({ active: false }).where(eq(teacherProfiles.userId, id));
  });
  revalidatePath("/admin/accounts");
  return { ok: true };
}

export async function adminCreateUser(prev: R, formData: FormData): Promise<R> {
  const admin = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "student");
  if (!name || name.length > 120) return { ok: false, error: "invalid" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "invalid" };
  if (password.length < 12) return { ok: false, error: "short" };
  if (!ROLES.includes(role as (typeof ROLES)[number])) return { ok: false, error: "bad_role" };
  let userId = 0;
  try {
    await db.transaction(async tx => {
      const [u] = await tx.insert(users).values({ name, email, passwordHash: hashPassword(password), role, emailVerified: true }).returning({ id: users.id });
      userId = u.id;
      if (role === "teacher") await tx.insert(teacherProfiles).values({ userId, ...TUTOR_DEFAULTS });
      await tx.insert(adminAuditLogs).values({ adminId: admin.id, targetUserId: userId, action: "account_created", reference: `user:${userId}`, note: "Account created by administrator.", metadata: { role } });
    });
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if ((e?.cause?.code ?? e?.code) === "23505") return { ok: false, error: "exists" };
    throw error;
  }
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