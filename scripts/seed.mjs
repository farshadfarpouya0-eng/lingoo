import "dotenv/config";
import { execSync } from "child_process";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import { hashPassword } from "../src/lib/auth.ts";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

const T = [
  ["Emily Carter", "US", "American", 2800, "Friendly IELTS coach · 8 yrs teaching in Shanghai", "English, Mandarin", "IELTS,Conversation,Business", 4.9, 1820, true, "women/44", 8, 9, 22],
  ["James Wilson", "GB", "British", 3200, "Cambridge CELTA · Business English for professionals in Tokyo", "English, Japanese", "Business,TOEIC,Interview", 4.95, 2410, true, "men/32", 9, 8, 21],
  ["Sophie Martin", "CA", "Canadian", 2200, "Kids English specialist · games, songs & phonics", "English, French, Mandarin", "Kids,Phonics,Conversation", 4.85, 980, true, "women/65", 8, 10, 22],
  ["Daniel Brooks", "AU", "Australian", 1900, "Relaxed conversation partner — speak more, fear less", "English, Japanese", "Conversation,Travel,Pronunciation", 4.8, 640, false, "men/45", 10, 8, 20],
  ["Olivia Chen", "US", "American", 3500, "TOEFL 120 strategies · Ivy League admissions prep", "English, Mandarin, Cantonese", "TOEFL,IELTS,Writing", 4.97, 3120, true, "women/68", -5, 17, 24],
  ["Ryan Murphy", "IE", "Irish", 1600, "Pronunciation & accent training, step by step", "English, Japanese", "Pronunciation,Conversation,Grammar", 4.75, 410, false, "men/76", 0, 12, 23],
  ["Hannah Lee", "NZ", "New Zealand", 2500, "Lived in Osaka 6 years · TOEIC 990 coach", "English, Japanese", "TOEIC,Business,Grammar", 4.9, 1530, true, "women/12", 9, 9, 21],
  ["Michael Grant", "US", "American", 2700, "Ex-Google PM · tech interviews in English", "English", "Interview,Business,Writing", 4.88, 760, true, "men/11", -8, 15, 24],
];
const REV = [
  ["Very patient! Explained grammar in Chinese when I got stuck.", 5],
  ["レッスンがとても楽しかったです。また予約します！", 5],
  ["老师非常专业，口语进步很大。", 5],
  ["Great materials and clear feedback.", 4],
];

async function seed() {
  const [{ c }] = await db.select({ c: sql`count(*)::int` }).from(schema.users);
  if (c > 0) { console.log("[seed] Database already has data — skipping seed."); return; }

  const demoPw = hashPassword("demo1234");
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.length < 16) {
    throw new Error("Set ADMIN_PASSWORD to a unique secret of at least 16 characters before database setup. It will not be printed to logs.");
  }
  const adminPw = hashPassword(adminPassword);
  const adminEmail = process.env.ADMIN_EMAIL || "admin@lingorain.com";

  const [admin] = await db.insert(schema.users).values({ name: "Admin", email: adminEmail, passwordHash: adminPw, role: "admin", avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=admin" }).returning();
  console.log(`[seed] Admin created → ${adminEmail}`);
  if (process.env.ENABLE_DEMO_DATA !== "true") {
    console.log("[seed] Demo accounts skipped. Set ENABLE_DEMO_DATA=true only in a development environment to create demo users.");
    return;
  }

  const [stu] = await db.insert(schema.users).values({ name: "Li Wei", email: "student@demo.com", passwordHash: demoPw, role: "student", balance: 18800, nativeLang: "zh", level: "B1", avatar: "https://randomuser.me/api/portraits/men/22.jpg" }).returning();
  const [stu2] = await db.insert(schema.users).values({ name: "Sato Yuki", email: "yuki@demo.com", passwordHash: demoPw, role: "student", balance: 15000, nativeLang: "ja", level: "A2", avatar: "https://randomuser.me/api/portraits/women/30.jpg" }).returning();
  await db.insert(schema.transactions).values([
    { userId: stu.id, type: "topup", amount: 30000, note: "Demo top-up" },
    { userId: stu2.id, type: "topup", amount: 15000, note: "Demo top-up" },
  ]);

  let emily = 0;
  for (let i = 0; i < T.length; i++) {
    const [name, country, accent, price, headline, speaks, tags, rating, lessonsCount, certified, pic, tzOffset, startHour, endHour] = T[i];
    const email = i === 0 ? "teacher@demo.com" : `${name.split(" ")[0].toLowerCase()}@demo.com`;
    const [u] = await db.insert(schema.users).values({ name, email, passwordHash: demoPw, role: "teacher", avatar: `https://randomuser.me/api/portraits/${pic}.jpg` }).returning();
    if (i === 0) emily = u.id;
    await db.insert(schema.teacherProfiles).values({
      userId: u.id, country, accent, price, headline, speaks, tags, rating, lessonsCount, certified, tzOffset, startHour, endHour,
      reviewsCount: Math.round(lessonsCount / 6),
      workDays: i % 3 === 2 ? "1,2,3,4,5" : "0,1,2,3,4,5,6",
      bio: `Hi! I'm ${name.split(" ")[0]}, a ${accent} English teacher. ${headline}.\n\nMy lessons are tailored to Chinese and Japanese learners: I know the common pronunciation and grammar challenges you face, and I'll help you overcome them with practical, fun conversation. Let's reach your goals together!`,
    });
    for (let r = 0; r < REV.length; r++) {
      await db.insert(schema.reviews).values({ studentId: r % 2 ? stu2.id : stu.id, teacherId: u.id, comment: REV[r][0], rating: REV[r][1] });
    }
  }

  const day = 86400_000;
  const at = (days, utcHour) => { const d = new Date(Date.now() + days * day); d.setUTCHours(utcHour, 0, 0, 0); return d; };
  const mk = async (startAt, status, notes = "") => {
    const [l] = await db.insert(schema.lessons).values({ studentId: stu.id, teacherId: emily, startAt, status, price: 2800, topic: "IELTS speaking part 2", teacherNotes: notes }).returning();
    await db.insert(schema.transactions).values({ userId: stu.id, type: "booking", amount: -2800, lessonId: l.id, note: `Lesson #${l.id}` });
    if (status === "completed") await db.insert(schema.transactions).values({ userId: emily, type: "earning", amount: 2380, lessonId: l.id, note: `Lesson #${l.id} completed` });
  };
  await mk(at(-5, 3), "completed", "Great progress on fluency. Homework: record a 2-minute answer daily.");
  await mk(at(-3, 8), "completed", "Worked on linking sounds and past tenses.");
  await mk(at(1, 2), "confirmed");
  await mk(at(2, 6), "pending");
  await db.insert(schema.payouts).values({ teacherId: emily, amount: 2000, method: "PayPal", account: "emily@example.com" });
  await db.insert(schema.transactions).values({ userId: emily, type: "payout", amount: -2000, note: "PayPal withdrawal" });
  await db.update(schema.users).set({ balance: 2760 }).where(sql`${schema.users.id} = ${emily}`);
  await db.insert(schema.messages).values([
    { fromId: stu.id, toId: emily, body: "Hi Emily! Can we focus on IELTS speaking next lesson?" },
    { fromId: emily, toId: stu.id, body: "Of course! I'll prepare Part 2 topics for you." },
  ]);
  console.log("[seed] Demo data created (8 tutors, 2 students, sample lessons).");
  console.log("[seed] DEMO LOGIN (password for all: demo1234):");
  console.log("       Student: student@demo.com · Tutor: teacher@demo.com");
  console.log("       ⚠ For a real public launch, delete these demo accounts and set a strong admin password (ADMIN_PASSWORD).");
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL is not set."); process.exit(1); }
  if (!process.argv.includes("--seed-only")) {
    console.log("[seed] Applying database schema (drizzle-kit push)...");
    execSync("npx drizzle-kit push", { stdio: "inherit" });
  }
  await seed();
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
