import type { Lang } from "./i18n";

export const DEFAULT_TIME_ZONE: Record<Lang, string> = { zh: "Asia/Shanghai", ja: "Asia/Tokyo", en: "UTC" };
export const COMMON_TIME_ZONES = [
  "UTC", "Europe/Berlin", "Europe/London", "Europe/Paris", "Europe/Istanbul", "Europe/Moscow",
  "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "America/Toronto",
  "America/Vancouver", "America/Sao_Paulo", "Asia/Dubai", "Asia/Kolkata", "Asia/Shanghai", "Asia/Hong_Kong",
  "Asia/Tokyo", "Asia/Seoul", "Asia/Singapore", "Australia/Sydney", "Pacific/Auckland",
] as const;

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 3 || value.length > 64) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date()); return true; }
  catch { return false; }
}

export function tzFor(lang: Lang, configured?: string | null) {
  const tz = isValidTimeZone(configured) ? configured : DEFAULT_TIME_ZONE[lang];
  const offsetMinutes = offsetAt(new Date(), tz);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return { tz, off: offsetMinutes / 60, label: `${tz} (UTC${sign}${hh}:${mm})` };
}

const loc = (lang: Lang) => lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US";
export function fmt(d: Date, lang: Lang, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }, timeZone?: string) {
  return new Intl.DateTimeFormat(loc(lang), { ...opts, timeZone: isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE[lang] }).format(d);
}

/** Legacy fixed-offset formatter retained for old profile records and older callers. */
export function fmtAtOffset(d: Date, lang: Lang, offset: number, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }) {
  const shifted = new Date(d.getTime() + offset * 3_600_000);
  return new Intl.DateTimeFormat(loc(lang), { ...opts, timeZone: "UTC", hourCycle: "h23", hour12: undefined }).format(shifted);
}
export function fmtAtZone(d: Date, lang: Lang, timeZone: string, opts?: Intl.DateTimeFormatOptions) {
  return fmt(d, lang, opts, timeZone);
}

export type ZonedParts = { year: number; month: number; day: number; weekday: number; hour: number; minute: number; second: number };
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const v = Object.fromEntries(p.map(x => [x.type, x.value]));
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { year: Number(v.year), month: Number(v.month), day: Number(v.day), weekday: days[v.weekday] ?? 0, hour: Number(v.hour), minute: Number(v.minute), second: Number(v.second) };
}

/** Offset in minutes east of UTC for an instant in an IANA zone. */
export function offsetAt(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime()) / 60_000);
}

/** Convert a wall-clock time in an IANA zone to a UTC instant; DST gaps are rejected. */
export function zonedLocalToUtc(dateStr: string, timeStr: string, timeZone: string): Date | null {
  if (!isValidTimeZone(timeZone)) return null;
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const tm = /^(\d{2}):(\d{2})$/.exec(timeStr);
  if (!dm || !tm) return null;
  const y = Number(dm[1]), mo = Number(dm[2]), d = Number(dm[3]), h = Number(tm[1]), mi = Number(tm[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const dateCheck = new Date(wall);
  if (dateCheck.getUTCFullYear() !== y || dateCheck.getUTCMonth() + 1 !== mo || dateCheck.getUTCDate() !== d) return null;
  let guess = wall;
  for (let i = 0; i < 4; i++) guess = wall - offsetAt(new Date(guess), timeZone) * 60_000;
  const result = new Date(guess), p = zonedParts(result, timeZone);
  if (p.year !== y || p.month !== mo || p.day !== d || p.hour !== h || p.minute !== mi) return null;
  return result;
}

export type WeeklySlot = { weekday: number; startMinute: number; endMinute: number };
export type BlockedRange = { start: number; end: number };
export type TeacherAvail = {
  startHour: number; endHour: number; tzOffset?: number; timeZone?: string; workDays: string;
  weeklySlots?: WeeklySlot[] | null;
  blocked?: BlockedRange[] | null;
};

/** Teacher-local weekday/minute for a UTC instant, using IANA timezone when available. */
export function teacherLocal(d: Date, tzOffset: number, timeZone?: string) {
  if (isValidTimeZone(timeZone)) {
    const p = zonedParts(d, timeZone!);
    return { weekday: p.weekday, minute: p.hour * 60 + p.minute, local: new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)) };
  }
  const local = new Date(d.getTime() + tzOffset * 3600_000);
  return { weekday: local.getUTCDay(), minute: local.getUTCHours() * 60 + local.getUTCMinutes(), local };
}
export function isSlotAvailable(d: Date, a: TeacherAvail, duration = 50) {
  const local = teacherLocal(d, a.tzOffset ?? 0, a.timeZone);
  const p = isValidTimeZone(a.timeZone) ? zonedParts(d, a.timeZone!) : null;
  const minute = local.minute;
  if (p ? p.second !== 0 || d.getUTCMilliseconds() !== 0 : local.local.getUTCSeconds() !== 0 || local.local.getUTCMilliseconds() !== 0) return false;
  if (![0, 30].includes(minute % 60)) return false;
  if (a.blocked?.length) {
    const s = d.getTime(), e = s + duration * 60_000;
    for (const b of a.blocked) if (s < b.end && e > b.start) return false;
  }
  if (a.weeklySlots && a.weeklySlots.length > 0) {
    for (const r of a.weeklySlots) if (r.weekday === local.weekday && minute >= r.startMinute && minute + duration <= r.endMinute) return true;
    return false;
  }
  return a.workDays.split(",").map(Number).includes(local.weekday) && minute >= a.startHour * 60 && minute + duration <= a.endHour * 60;
}
export const MIN_LEAD_MS = 30 * 60_000;
export const HORIZON_DAYS = 14;

/** A slot remains bookable only while at least 30 exact minutes remain. */
export function isBookingLeadTimeOpen(d: Date | number | string, now = Date.now()) {
  const startMs = d instanceof Date ? d.getTime() : typeof d === "number" ? d : Date.parse(d);
  return Number.isFinite(startMs) && startMs - now >= MIN_LEAD_MS;
}

export function slotIsBookable(d: Date, a: TeacherAvail, now = Date.now(), duration = 50) {
  return isBookingLeadTimeOpen(d, now) && d.getTime() <= now + HORIZON_DAYS * 86400_000 && isSlotAvailable(d, a, duration);
}
export function buildSlots(lang: Lang, a: TeacherAvail, taken: Set<number>, duration = 50) {
  const timeZone = isValidTimeZone(a.timeZone) ? a.timeZone! : (a.tzOffset === 9 ? "Asia/Tokyo" : a.tzOffset === 8 ? "Asia/Shanghai" : "UTC");
  const now = Date.now();
  const horizon = now + HORIZON_DAYS * 86400_000;
  const current = zonedParts(new Date(now), timeZone);
  const startDay = Date.UTC(current.year, current.month - 1, current.day);
  const groups = new Map<string, { key: string; label: string; slots: { iso: string; label: string }[] }>();
  for (let day = 0; day <= HORIZON_DAYS; day++) {
    const dayDate = new Date(startDay + day * 86400_000);
    const y = dayDate.getUTCFullYear(), mo = dayDate.getUTCMonth() + 1, d = dayDate.getUTCDate();
    const dateStr = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    for (let minute = 0; minute < 1440; minute += 30) {
      const timeStr = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      const slot = zonedLocalToUtc(dateStr, timeStr, timeZone);
      if (!slot) continue; // Skip nonexistent local times during DST spring-forward.
      const time = slot.getTime();
      if (!isBookingLeadTimeOpen(time, now) || time > horizon) continue;
      if (!isSlotAvailable(slot, { ...a, timeZone }, duration)) continue;
      if (taken.has(time) || (duration > 30 && (taken.has(time - 30 * 60_000) || taken.has(time + 30 * 60_000)))) continue;
      const key = dateStr;
      if (!groups.has(key)) groups.set(key, { key, label: fmt(slot, lang, { weekday: "short", month: "numeric", day: "numeric" }, timeZone), slots: [] });
      groups.get(key)!.slots.push({ iso: slot.toISOString(), label: fmt(slot, lang, { hour: "2-digit", minute: "2-digit", hour12: false }, timeZone) });
    }
  }
  return [...groups.values()].slice(0, 14);
}
export function formatMinutes(m: number) {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
export function weekdayName(weekday: number, lang: Lang, style: "short" | "long" = "short") {
  return new Intl.DateTimeFormat(loc(lang), { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + weekday)));
}
export const nowMs = () => Date.now();
