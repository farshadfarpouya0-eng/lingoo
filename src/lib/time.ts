import type { Lang } from "./i18n";
export function tzFor(lang: Lang) {
  return lang === "ja" ? { tz: "Asia/Tokyo", off: 9, label: "JST (UTC+9)" } : { tz: "Asia/Shanghai", off: 8, label: lang === "zh" ? "北京时间 (UTC+8)" : "UTC+8" };
}
const loc = (lang: Lang) => lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-US";
export function fmt(d: Date, lang: Lang, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }) {
  return new Intl.DateTimeFormat(loc(lang), { ...opts, timeZone: tzFor(lang).tz }).format(d);
}
export type WeeklySlot = { weekday: number; startMinute: number; endMinute: number };
export type BlockedRange = { start: number; end: number };
export type TeacherAvail = {
  startHour: number; endHour: number; tzOffset: number; workDays: string;
  weeklySlots?: WeeklySlot[] | null;
  blocked?: BlockedRange[] | null;
};
/** Teacher-local weekday/minute for a UTC instant. */
export function teacherLocal(d: Date, tzOffset: number) {
  const local = new Date(d.getTime() + tzOffset * 3600_000);
  return { weekday: local.getUTCDay(), minute: local.getUTCHours() * 60 + local.getUTCMinutes(), local };
}
export function isSlotAvailable(d: Date, a: TeacherAvail, duration = 50) {
  const local = new Date(d.getTime() + a.tzOffset * 3600_000);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (local.getUTCSeconds() !== 0 || local.getUTCMilliseconds() !== 0) return false;
  if (duration === 50 && local.getUTCMinutes() !== 0) return false;
  if (duration === 25 && ![0, 30].includes(local.getUTCMinutes())) return false;
  // One-off blocks (vacation / day off) always win.
  if (a.blocked?.length) {
    const s = d.getTime(), e = s + duration * 60_000;
    for (const b of a.blocked) if (s < b.end && e > b.start) return false;
  }
  // Precise weekly timetable when the tutor has defined one.
  if (a.weeklySlots && a.weeklySlots.length > 0) {
    const wd = local.getUTCDay();
    for (const r of a.weeklySlots) {
      if (r.weekday === wd && minute >= r.startMinute && minute + duration <= r.endMinute) return true;
    }
    return false;
  }
  return a.workDays.split(",").map(Number).includes(local.getUTCDay()) && minute >= a.startHour * 60 && minute + duration <= a.endHour * 60;
}
export const MIN_LEAD_MS = 2 * 3600_000;
export const HORIZON_DAYS = 14;
export function slotIsBookable(d: Date, a: TeacherAvail, now = Date.now(), duration = 50) {
  return d.getTime() >= now + MIN_LEAD_MS && d.getTime() <= now + HORIZON_DAYS * 86400_000 && isSlotAvailable(d, a, duration);
}
export function buildSlots(lang: Lang, a: TeacherAvail, taken: Set<number>, duration = 50) {
  const { off } = tzFor(lang);
  const now = Date.now();
  const step = (duration === 25 ? 30 : 60) * 60_000;
  const first = Math.ceil((now + MIN_LEAD_MS) / step) * step;
  const groups = new Map<string, { key: string; label: string; slots: { iso: string; label: string }[] }>();
  for (let time = first; time <= now + HORIZON_DAYS * 86400_000; time += step) {
    const d = new Date(time);
    if (!isSlotAvailable(d, a, duration) || taken.has(time) || (duration === 50 && taken.has(time + 30 * 60_000))) continue;
    const key = new Date(time + off * 3600_000).toISOString().slice(0, 10);
    if (!groups.has(key)) groups.set(key, { key, label: fmt(d, lang, { weekday: "short", month: "numeric", day: "numeric" }), slots: [] });
    groups.get(key)!.slots.push({ iso: d.toISOString(), label: fmt(d, lang, { hour: "2-digit", minute: "2-digit", hour12: false }) });
  }
  return [...groups.values()].slice(0, 14);
}
export function formatMinutes(m: number) {
  const h = Math.floor(m / 60), mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
export function weekdayName(weekday: number, lang: Lang, style: "short" | "long" = "short") {
  // 2024-01-07 was a Sunday (weekday 0).
  return new Intl.DateTimeFormat(loc(lang), { weekday: style, timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + weekday)));
}

/** Current time in ms. Kept as a helper so render code does not call Date.now() inline. */
export const nowMs = () => Date.now();
