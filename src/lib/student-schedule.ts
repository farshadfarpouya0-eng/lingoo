import type { Lang } from "./i18n";
import { DEFAULT_TIME_ZONE, isBookingLeadTimeOpen, isValidTimeZone, zonedParts } from "./time";

export const scheduleLocale = (lang: Lang) => lang === "zh" ? "zh-CN" : lang === "ja" ? "ja-JP" : "en-GB";

/** A saved UTC zone is a valid preference; never silently replace it with device time. */
export function studentTimeZone(profileZone: string | null | undefined, lang: Lang, deviceZone?: string) {
  if (isValidTimeZone(profileZone)) return profileZone;
  if (isValidTimeZone(deviceZone)) return deviceZone;
  return DEFAULT_TIME_ZONE[lang];
}

export type StudentSlot = { iso: string; label: string; offset: string };
export type StudentDay = { key: string; label: string; shortLabel: string; slots: StudentSlot[] };

/** Only UTC instants cross the server/client boundary. No teacher labels or zone are needed. */
export function publicSlotInstants(days: { slots: { iso: string }[] }[]) {
  return [...new Set(days.flatMap(day => day.slots.map(slot => slot.iso)))].sort();
}

/** Re-group, do not just relabel teacher-day buckets. A local midnight starts a new day. */
export function groupStudentSlots(instants: readonly string[], lang: Lang, zone: string, now: number): StudentDay[] {
  const timeZone = studentTimeZone(zone, lang);
  const locale = scheduleLocale(lang);
  const dateFormat = new Intl.DateTimeFormat(locale, { timeZone, weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const shortFormat = new Intl.DateTimeFormat(locale, { timeZone, weekday: "short", day: "numeric", month: "short" });
  const timeFormat = new Intl.DateTimeFormat(locale, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const offsetFormat = new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "shortOffset" });
  const groups = new Map<string, StudentDay>();
  for (const ms of [...new Set(instants.map(iso => Date.parse(iso)).filter(Number.isFinite))].sort((a, b) => a - b)) {
    if (!isBookingLeadTimeOpen(ms, now)) continue;
    const date = new Date(ms);
    const p = zonedParts(date, timeZone);
    const key = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, label: dateFormat.format(date), shortLabel: shortFormat.format(date), slots: [] };
      groups.set(key, group);
    }
    group.slots.push({
      iso: date.toISOString(), label: timeFormat.format(date),
      offset: offsetFormat.formatToParts(date).find(part => part.type === "timeZoneName")?.value || "",
    });
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function studentLessonRange(iso: string, duration: number, zone: string, lang: Lang) {
  const start = new Date(iso);
  if (!Number.isFinite(start.getTime())) return "";
  const end = new Date(start.getTime() + duration * 60_000);
  const locale = scheduleLocale(lang);
  const date = new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const time = new Intl.DateTimeFormat(locale, { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const endDate = date.format(start) === date.format(end) ? "" : `${date.format(end)}, `;
  return `${date.format(start)} · ${time.format(start)} – ${endDate}${time.format(end)}`;
}

export const SCHEDULE_COPY = {
  en: {
    zone: "Your time zone", change: "Change", note: "All dates and times below are in your time zone.",
    availability: "Available times", next: "NEXT 14 DAYS", starts: "Available lesson starts", minutes: "min", slots: "times",
    noSlots: "No available times in the next 14 days.", select: "Choose a day, then a time", selected: "Your lesson", lead: "Book at least 30 minutes before the lesson starts.",
    private: "Private", group: "Small group", privateHint: "1 student", groupHint: "2–4 students", duration: "Lesson length", trial: "Try a 25-minute lesson · 50% off",
    same: "Your tutor sees the same lesson in their own local time.", timeGone: "This time is no longer bookable. Please choose another.",
    seats: "students already booked", newGroup: "You will be the first student in this small-group class.", discount: "25% group discount", pay: "Lesson total", more: "Show all available times",
  },
  zh: {
    zone: "你的时区", change: "修改", note: "下方所有日期和时间均按你的时区显示。",
    availability: "可预约时间", next: "未来14天", starts: "课程开始时间", minutes: "分钟", slots: "个时间",
    noSlots: "未来14天暂无可预约时间。", select: "先选择日期，再选择时间", selected: "你的课程", lead: "请至少提前30分钟预约。",
    private: "一对一", group: "小班课", privateHint: "1位学生", groupHint: "2–4位学生", duration: "课程时长", trial: "25分钟体验课 · 五折",
    same: "老师会按自己的当地时间查看同一节课。", timeGone: "此时间已无法预约，请选择其他时间。",
    seats: "位学生已预约", newGroup: "你将成为这节小班课的第一位学生。", discount: "小班课优惠25%", pay: "课程费用", more: "查看所有可预约时间",
  },
  ja: {
    zone: "あなたのタイムゾーン", change: "変更", note: "以下の日付と時刻はすべてあなたのタイムゾーンで表示されます。",
    availability: "予約可能な時間", next: "今後14日間", starts: "レッスン開始時刻", minutes: "分", slots: "枠",
    noSlots: "今後14日間に予約可能な時間はありません。", select: "日付を選び、時間を選択", selected: "あなたのレッスン", lead: "開始30分前までにご予約ください。",
    private: "マンツーマン", group: "少人数グループ", privateHint: "生徒1名", groupHint: "生徒2〜4名", duration: "レッスン時間", trial: "25分の体験レッスン · 50%オフ",
    same: "講師には同じレッスンが現地時間で表示されます。", timeGone: "この時間は予約できなくなりました。別の時間を選んでください。",
    seats: "名が予約済み", newGroup: "この少人数クラスの最初の生徒になります。", discount: "グループ割引25%", pay: "レッスン料金", more: "すべての予約可能時間を表示",
  },
} as const;
