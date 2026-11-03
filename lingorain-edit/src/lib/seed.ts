import { db } from "@/db";
import { users, teacherProfiles, teacherWeeklySlots, reviews, lessons, payouts, messages } from "@/db/schema";
import { hashPassword } from "./auth";
import { demoDataEnabled } from "./runtime-policy";
import { ensurePreviewDatabase } from "../db/preview-bootstrap";
import { eq, sql } from "drizzle-orm";
import { ledger } from "./money";

// name, country, accent, price(¢), headline, speaks, tags, rating, lessons, certified, photo, tzOffset, startHour, endHour
const T = [
  ["Emily Carter", "US", "American", 2800, "Friendly IELTS coach · 8 yrs teaching in Shanghai", "English, Mandarin", "IELTS,Conversation,Business", 4.9, 1820, true, "women/44", 8, 9, 22],
  ["James Wilson", "GB", "British", 3200, "Cambridge CELTA · Business English for professionals in Tokyo", "English, Japanese", "Business,TOEIC,Interview", 4.95, 2410, true, "men/32", 9, 8, 21],
  ["Sophie Martin", "CA", "Canadian", 2200, "Kids English specialist · games, songs & phonics", "English, French, Mandarin", "Kids,Phonics,Conversation", 4.85, 980, true, "women/65", 8, 10, 22],
  ["Daniel Brooks", "AU", "Australian", 1900, "Relaxed conversation partner — speak more, fear less", "English, Japanese", "Conversation,Travel,Pronunciation", 4.8, 640, false, "men/45", 10, 8, 20],
  ["Olivia Chen", "US", "American", 3500, "TOEFL 120 strategies · Ivy League admissions prep", "English, Mandarin, Cantonese", "TOEFL,IELTS,Writing", 4.97, 3120, true, "women/68", -5, 17, 24],
  ["Ryan Murphy", "IE", "Irish", 1600, "Pronunciation & accent training, step by step", "English, Japanese", "Pronunciation,Conversation,Grammar", 4.75, 410, false, "men/76", 0, 12, 23],
  ["Hannah Lee", "NZ", "New Zealand", 2500, "Lived in Osaka 6 years · TOEIC 990 coach", "English, Japanese", "TOEIC,Business,Grammar", 4.9, 1530, true, "women/12", 9, 9, 21],
  ["Michael Grant", "US", "American", 2700, "Ex-Google PM · tech interviews in English", "English", "Interview,Business,Writing", 4.88, 760, true, "men/11", -8, 15, 24],
] as const;

const REV = [
  ["Very patient! Explained grammar in Chinese when I got stuck.", 5],
  ["レッスンがとても楽しかったです。また予約します！", 5],
  ["老师非常专业，口语进步很大。", 5],
  ["Great materials and clear feedback.", 4],
] as const;

let seeded = false;
let seeding: Promise<void> | undefined;
export async function ensureSeed() {
  await ensurePreviewDatabase();
  if (seeded || !demoDataEnabled()) return;
  if (seeding) return seeding;
  seeding = db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(918273)`);
    const [{ c }] = await tx.select({ c: sql<number>`count(*)::int` }).from(users);
    if (c > 0) return;
    const pw = hashPassword("demo1234");
    const [admin] = await tx.insert(users).values({ name: "Admin", email: "admin@demo.com", passwordHash: pw, role: "admin", avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=admin" }).returning();
    void admin;
    const [stu] = await tx.insert(users).values({ name: "Li Wei", email: "student@demo.com", passwordHash: pw, role: "student", balance: 0, nativeLang: "zh", level: "B1", avatar: "https://randomuser.me/api/portraits/men/22.jpg" }).returning();
    const [stu2] = await tx.insert(users).values({ name: "Sato Yuki", email: "yuki@demo.com", passwordHash: pw, role: "student", balance: 0, nativeLang: "ja", level: "A2", avatar: "https://randomuser.me/api/portraits/women/30.jpg" }).returning();
    await tx.update(users).set({ balance: 18800 }).where(eq(users.id, stu.id));
    await tx.update(users).set({ balance: 15000 }).where(eq(users.id, stu2.id));
    await ledger(tx, stu.id, "topup", 18800, "Demo seed opening balance", undefined, `seed-topup:${stu.id}`);
    await ledger(tx, stu2.id, "topup", 15000, "Demo seed opening balance", undefined, `seed-topup:${stu2.id}`);

    let emily = 0;
    for (let i = 0; i < T.length; i++) {
      const [name, country, accent, price, headline, speaks, tags, rating, lessonsCount, certified, pic, tzOffset, startHour, endHour] = T[i];
      const email = i === 0 ? "teacher@demo.com" : `${name.split(" ")[0].toLowerCase()}@demo.com`;
      const [u] = await tx.insert(users).values({ name, email, passwordHash: pw, role: "teacher", avatar: `https://randomuser.me/api/portraits/${pic}.jpg` }).returning();
      if (i === 0) emily = u.id;
      const workDays = i % 3 === 2 ? "1,2,3,4,5" : "0,1,2,3,4,5,6";
      await tx.insert(teacherProfiles).values({
        userId: u.id, country, accent, price, headline, speaks, tags, rating, lessonsCount, certified, tzOffset, startHour, endHour,
        reviewsCount: Math.round(lessonsCount / 6),
        workDays,
        bio: `Hi! I'm ${name.split(" ")[0]}, a ${accent} English teacher. ${headline}.\n\nMy lessons are tailored to Chinese and Japanese learners: I know the common pronunciation and grammar challenges you face, and I'll help you overcome them with practical, fun conversation. Let's reach your goals together!`,
      });
      // Real weekly timetable: split the day with a lunch break so the grid looks alive.
      const mid = Math.min(endHour - 1, Math.max(startHour + 2, 13));
      const daySlots = workDays.split(",").map(Number).flatMap(wd =>
        i % 2 === 0
          ? [{ teacherId: u.id, weekday: wd, startMinute: startHour * 60, endMinute: mid * 60 }, { teacherId: u.id, weekday: wd, startMinute: (mid + 1) * 60, endMinute: endHour * 60 }]
          : [{ teacherId: u.id, weekday: wd, startMinute: startHour * 60, endMinute: endHour * 60 }],
      );
      if (daySlots.length) await tx.insert(teacherWeeklySlots).values(daySlots);
      for (let r = 0; r < REV.length; r++) {
        await tx.insert(reviews).values({ studentId: r % 2 ? stu2.id : stu.id, teacherId: u.id, comment: REV[r][0], rating: REV[r][1] });
      }
    }

    // Demo lessons between Li Wei and Emily (UTC hours chosen inside Emily's 9–22 UTC+8 window)
    const day = 86400_000;
    const at = (days: number, utcHour: number) => { const d = new Date(Date.now() + days * day); d.setUTCHours(utcHour, 0, 0, 0); return d; };
    const mk = async (startAt: Date, status: string, notes = "") => {
      const [l] = await tx.insert(lessons).values({ studentId: stu.id, teacherId: emily, startAt, status, price: 2800, topic: "IELTS speaking part 2", teacherNotes: notes }).returning();
      await tx.update(users).set({ balance: sql`${users.balance} - 2800` }).where(eq(users.id, stu.id));
      await ledger(tx, stu.id, "booking", -2800, `Lesson #${l.id}`, l.id, `seed-booking:${l.id}`);
      if (status === "completed") {
        await tx.update(users).set({ balance: sql`${users.balance} + 2380` }).where(eq(users.id, emily));
        await ledger(tx, emily, "earning", 2380, `Lesson #${l.id} completed`, l.id, `seed-earning:${l.id}`);
      }
    };
    await mk(at(-5, 3), "completed", "Great progress on fluency. Homework: record a 2-minute answer daily.");
    await mk(at(-3, 8), "completed", "Worked on linking sounds and past tenses.");
    await mk(at(1, 2), "confirmed");
    await mk(at(2, 6), "pending");
    await tx.insert(payouts).values({ teacherId: emily, amount: 2000, method: "PayPal", account: "emily@example.com" });
    await tx.update(users).set({ balance: sql`${users.balance} - 2000` }).where(eq(users.id, emily));
    await ledger(tx, emily, "payout", -2000, "PayPal withdrawal", undefined, `seed-payout:${emily}`);
    await tx.insert(messages).values([
      { fromId: stu.id, toId: emily, body: "Hi Emily! Can we focus on IELTS speaking next lesson?" },
      { fromId: emily, toId: stu.id, body: "Of course! 你好 Li Wei — I'll prepare Part 2 topics for you. 😊" },
    ]);
  }).then(() => { seeded = true; }).finally(() => { seeding = undefined; });
  await seeding;
}
