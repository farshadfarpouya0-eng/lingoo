import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { teacherBlockedSlots, teacherProfiles, teacherWeeklySlots } from "@/db/schema";
import { isValidTimeZone, offsetAt, zonedLocalToUtc } from "./time";
import type { BlockedRange, WeeklySlot } from "./time";

export type TimetableData = {
  tzOffset: number;
  timeZone: string;
  weeklySlots: WeeklySlot[];
  blocked: { id: number; startAt: Date; endAt: Date; reason: string }[];
  blockedRanges: BlockedRange[];
  hasCustomSchedule: boolean;
};

export async function getTeacherTimetable(teacherId: number, tzOffsetFallback = 8): Promise<TimetableData> {
  const [rows, blocks, prof] = await Promise.all([
    db.select({ weekday: teacherWeeklySlots.weekday, startMinute: teacherWeeklySlots.startMinute, endMinute: teacherWeeklySlots.endMinute })
      .from(teacherWeeklySlots).where(eq(teacherWeeklySlots.teacherId, teacherId)),
    db.select().from(teacherBlockedSlots).where(and(eq(teacherBlockedSlots.teacherId, teacherId), gte(teacherBlockedSlots.endAt, new Date()))),
    db.select({ tzOffset: teacherProfiles.tzOffset, timeZone: teacherProfiles.timeZone }).from(teacherProfiles).where(eq(teacherProfiles.userId, teacherId)),
  ]);
  const tzOffset = prof[0]?.tzOffset ?? tzOffsetFallback;
  const timeZone = isValidTimeZone(prof[0]?.timeZone) ? prof[0]!.timeZone : (tzOffset === 9 ? "Asia/Tokyo" : tzOffset === 8 ? "Asia/Shanghai" : "UTC");
  return {
    tzOffset, timeZone,
    weeklySlots: rows,
    blocked: blocks.map(b => ({ id: b.id, startAt: b.startAt, endAt: b.endAt, reason: b.reason })),
    blockedRanges: blocks.map(b => ({ start: b.startAt.getTime(), end: b.endAt.getTime() })),
    hasCustomSchedule: rows.length > 0,
  };
}

/** Validate + merge overlapping/adjacent ranges per weekday. */
export function normalizeWeeklySlots(input: unknown): WeeklySlot[] {
  if (!Array.isArray(input)) throw new Error("slot");
  const clean: WeeklySlot[] = [];
  for (const r of input.slice(0, 100)) {
    const o = r as Record<string, unknown>;
    const weekday = Number(o.weekday), s = Number(o.startMinute), e = Number(o.endMinute);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error("slot");
    if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e > 1440 || s >= e) throw new Error("slot");
    if (s % 30 !== 0 || e % 30 !== 0) throw new Error("slot");
    clean.push({ weekday, startMinute: s, endMinute: e });
  }
  const out: WeeklySlot[] = [];
  for (let wd = 0; wd <= 6; wd++) {
    const day = clean.filter(r => r.weekday === wd).sort((a, b) => a.startMinute - b.startMinute);
    let cur: WeeklySlot | null = null;
    for (const r of day) {
      if (cur && r.startMinute <= cur.endMinute) cur.endMinute = Math.max(cur.endMinute, r.endMinute);
      else { if (cur) out.push(cur); cur = { ...r }; }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Half-hour cell keys "wd-half" selected in the UI -> merged ranges. */
export function cellsToRanges(cells: string[]): WeeklySlot[] {
  const perDay = new Map<number, number[]>();
  for (const key of cells.slice(0, 336)) {
    const [w, h] = key.split("-").map(Number);
    if (!Number.isInteger(w) || w < 0 || w > 6 || !Number.isInteger(h) || h < 0 || h > 47) continue;
    if (!perDay.has(w)) perDay.set(w, []);
    perDay.get(w)!.push(h);
  }
  const ranges: WeeklySlot[] = [];
  for (const [wd, halves] of perDay) {
    const sorted = [...new Set(halves)].sort((a, b) => a - b);
    let s: number | null = null, prev = -2;
    for (const h of sorted) {
      if (s === null) { s = h; prev = h; continue; }
      if (h === prev + 1) { prev = h; continue; }
      ranges.push({ weekday: wd, startMinute: s * 30, endMinute: (prev + 1) * 30 });
      s = h; prev = h;
    }
    if (s !== null) ranges.push({ weekday: wd, startMinute: s * 30, endMinute: (prev + 1) * 30 });
  }
  return ranges;
}

export function rangesToCells(ranges: WeeklySlot[]): Set<string> {
  const set = new Set<string>();
  for (const r of ranges) {
    for (let m = r.startMinute; m + 30 <= r.endMinute; m += 30) set.add(`${r.weekday}-${Math.floor(m / 30)}`);
  }
  return set;
}

/** Convert teacher-local wall time to a UTC Date using IANA timezone; numeric offset is legacy fallback. */
export function teacherLocalToUtc(dateStr: string, timeStr: string, timeZone: string | number): Date | null {
  if (typeof timeZone === "string") return zonedLocalToUtc(dateStr, timeStr, timeZone);
  const tzOffset = timeZone;
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const tm = /^(\d{2}):(\d{2})$/.exec(timeStr);
  if (!dm || !tm) return null;
  const y = Number(dm[1]), mo = Number(dm[2]) - 1, d = Number(dm[3]);
  const h = Number(tm[1]), mi = Number(tm[2]);
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const utc = Date.UTC(y, mo, d, h, mi) - tzOffset * 3600_000;
  const dt = new Date(utc);
  return isNaN(dt.getTime()) ? null : dt;
}
