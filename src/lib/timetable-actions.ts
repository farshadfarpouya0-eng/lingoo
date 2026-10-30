"use server";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { lessons, teacherBlockedSlots, teacherProfiles, teacherWeeklySlots } from "@/db/schema";
import { getUser } from "./auth";
import { hit } from "./ratelimit";
import { cellsToRanges, normalizeWeeklySlots, teacherLocalToUtc } from "./timetable";
import { isValidTimeZone } from "./time";

const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);

export async function saveWeeklyTimetable(fd: FormData) {
  const u = await getUser();
  if (!u) redirect("/login");
  if (u.role !== "teacher") redirect("/dashboard");
  if (!await hit(`timetable:${u.id}`, 30, 3600_000)) redirect("/dashboard?tab=schedule&err=rate");
  let ranges;
  try {
    const raw = JSON.parse(String(fd.get("slots") ?? "[]")) as unknown;
    // Accept either cell keys ["1-18", ...] or range objects.
    const list = Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string"
      ? cellsToRanges(raw as string[])
      : raw;
    ranges = normalizeWeeklySlots(list);
  } catch { redirect("/dashboard?tab=schedule&err=slot"); }
  const tzOffset = Math.min(14, Math.max(-12, Math.round(Number(fd.get("tzOffset")) || 0)));
  const requestedZone = str(fd, "timeZone", 64);
  const timeZone = isValidTimeZone(requestedZone) ? requestedZone : "UTC";
  await db.transaction(async tx => {
    await tx.delete(teacherWeeklySlots).where(eq(teacherWeeklySlots.teacherId, u.id));
    if (ranges.length) await tx.insert(teacherWeeklySlots).values(ranges.map(r => ({ teacherId: u.id, ...r })));
    // Keep legacy columns in sync as a fallback summary.
    const days = [...new Set(ranges.map(r => r.weekday))].sort((a, b) => a - b);
    const starts = ranges.map(r => r.startMinute), ends = ranges.map(r => r.endMinute);
    await tx.update(teacherProfiles).set({
      tzOffset, timeZone,
      workDays: days.length ? days.join(",") : "1,2,3,4,5",
      startHour: starts.length ? Math.floor(Math.min(...starts) / 60) : 9,
      endHour: ends.length ? Math.ceil(Math.max(...ends) / 60) : 21,
    }).where(eq(teacherProfiles.userId, u.id));
  });
  revalidatePath("/dashboard");
  revalidatePath(`/teachers/${u.id}`);
  redirect("/dashboard?tab=schedule&ok=saved");
}

export async function addBlockedSlot(fd: FormData) {
  const u = await getUser();
  if (!u) redirect("/login");
  if (u.role !== "teacher") redirect("/dashboard");
  if (!await hit(`block:${u.id}`, 30, 3600_000)) redirect("/dashboard?tab=schedule&err=rate");
  const [prof] = await db.select({ tzOffset: teacherProfiles.tzOffset, timeZone: teacherProfiles.timeZone }).from(teacherProfiles).where(eq(teacherProfiles.userId, u.id));
  const tz = isValidTimeZone(prof?.timeZone) ? prof!.timeZone : (prof?.tzOffset ?? 0);
  const date = str(fd, "date", 10), start = str(fd, "start", 5), end = str(fd, "end", 5);
  const reason = str(fd, "reason", 120);
  const startAt = teacherLocalToUtc(date, start, tz);
  const endAt = teacherLocalToUtc(date, end, tz);
  if (!startAt || !endAt || endAt.getTime() <= startAt.getTime() || endAt.getTime() - startAt.getTime() > 24 * 3600_000 || startAt.getTime() < Date.now() - 3600_000) {
    redirect("/dashboard?tab=schedule&err=slot");
  }
  // Refuse to block time that already has a live lesson.
  const [clash] = await db.select({ id: lessons.id }).from(lessons).where(and(
    eq(lessons.teacherId, u.id), ne(lessons.status, "cancelled"),
    sql`${lessons.startAt} < ${endAt}`, sql`${lessons.startAt} + ${lessons.duration} * interval '1 minute' > ${startAt}`,
  )).limit(1);
  if (clash) redirect("/dashboard?tab=schedule&err=clash");
  await db.insert(teacherBlockedSlots).values({ teacherId: u.id, startAt, endAt, reason });
  revalidatePath("/dashboard");
  revalidatePath(`/teachers/${u.id}`);
  redirect("/dashboard?tab=schedule&ok=saved");
}

export async function deleteBlockedSlot(fd: FormData) {
  const u = await getUser();
  if (!u) redirect("/login");
  if (u.role !== "teacher") return;
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return;
  await db.delete(teacherBlockedSlots).where(and(eq(teacherBlockedSlots.id, id), eq(teacherBlockedSlots.teacherId, u.id)));
  revalidatePath("/dashboard");
  revalidatePath(`/teachers/${u.id}`);
}

export async function clearWeeklyTimetable() {
  const u = await getUser();
  if (!u || u.role !== "teacher") redirect("/login");
  await db.delete(teacherWeeklySlots).where(eq(teacherWeeklySlots.teacherId, u.id));
  revalidatePath("/dashboard");
  redirect("/dashboard?tab=schedule&ok=saved");
}


