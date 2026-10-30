"use server";
import { cookies, headers } from "next/headers";
import { encryptPayoutAccount, isEncryptedPayoutAccount } from "./payout-crypto";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { PUBLIC_TUTORS_TAG } from "./public-tutors";
import { db } from "@/db";
import { users, teacherProfiles, lessons, reviews, messages, payouts, referrals } from "@/db/schema";
import { canAccessLesson } from "@/lib/lesson-access";
import { and, eq, sql } from "drizzle-orm";
import { createSession, destroySession, getUser, hashPassword, verifyPassword } from "./auth";
import { clientIp, hit } from "./ratelimit";
import { MIN_PAYOUT, ledger } from "./money";
import { reserveLesson, changeLessonStatus } from "./lesson-service";
import { chooseClassroom } from "./room-service";
import { demoPaymentsEnabled } from "./runtime-policy";
import { getIntegrationConfig } from "./integration-config";
import { isValidTimeZone, DEFAULT_TIME_ZONE } from "./time";
import type { Lang } from "./i18n";
import { sendVerificationForNewUser } from "./auth-flows";
import { isAccountSuspended } from "@/lib/account-status";

const str = (fd: FormData, k: string, max = 200) => String(fd.get(k) ?? "").trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const pgCode = (e: unknown) => { const x = e as { code?: string; cause?: { code?: string } }; return x?.code ?? x?.cause?.code; };

export async function setLang(fd: FormData) {
  const l = str(fd, "lang", 4);
  if (!["zh", "ja", "en"].includes(l)) return;
  (await cookies()).set("lang", l, { path: "/", maxAge: 31536000, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function login(_: unknown, fd: FormData) {
  const email = str(fd, "email", 254).toLowerCase();
  const ip = await clientIp();
  if ((ip !== "untrusted-proxy-disabled" && !await hit(`login:ip:${ip}`, 30, 600_000))
    || !await hit(`login:email:${email}`, 8, 600_000)) return { error: "rate" };
  const [u] = await db.select().from(users).where(eq(users.email, email));
  const ok = verifyPassword(String(fd.get("password") ?? "").slice(0, 200), u?.passwordHash ?? null);
  if (!u || !ok) return { error: "invalid" };
  if (!u.emailVerified) return { error: "verify" };
  await createSession(u.id);
  if (isAccountSuspended(u.suspended, u.suspendedUntil)) redirect("/appeals");
  redirect(u.role === "admin" ? "/admin" : "/dashboard");
}

/* ⭐ Teacher sign-up now starts INACTIVE — admin must approve after seeing documents. */
export async function register(_: unknown, fd: FormData) {
  const ip = await clientIp();
  if (ip !== "untrusted-proxy-disabled" && !await hit(`reg:ip:${ip}`, 10, 3600_000)) return { error: "rate" };
  const email = str(fd, "email", 254).toLowerCase();
  const name = str(fd, "name", 60);
  const pw = String(fd.get("password") ?? "").slice(0, 200);
  if (!await hit(`reg:email:${email}`, 5, 3600_000)) return { error: "rate" };
  const role = fd.get("role") === "teacher" ? "teacher" : "student";
  const nativeLang: Lang = ["zh", "ja", "en"].includes(str(fd, "nativeLang", 2)) ? str(fd, "nativeLang", 2) as Lang : "en";
  if (!EMAIL_RE.test(email) || name.length < 2 || pw.length < 12) return { error: "fill" };
  const requestedZone = str(fd, "timeZone", 80);
  const timeZone = isValidTimeZone(requestedZone) ? requestedZone : DEFAULT_TIME_ZONE[nativeLang];
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return { error: "exists" };

  const u = await db.transaction(async tx => {
    const referralCode = randomBytes(6).toString("hex").toUpperCase();
    const [nu] = await tx.insert(users).values({
      email, name, passwordHash: hashPassword(pw), role, nativeLang, referralCode, emailVerified: false, timeZone,
      avatar: `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(name)}`,
    }).returning();

    if (role === "teacher") {
      /* 🔒 not publicly listed until an admin approves */
      await tx.insert(teacherProfiles).values({
        userId: nu.id,
        headline: "New English tutor",
        timeZone,
        active: false,
      });
    }

    const invitedBy = str(fd, "referralCode", 24).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (role === "student" && invitedBy) {
      const [referrer] = await tx.select({ id: users.id, email: users.email, suspended: users.suspended, suspendedUntil: users.suspendedUntil })
        .from(users).where(eq(users.referralCode, invitedBy)).for("update");
      if (referrer && referrer.id !== nu.id && referrer.email.toLowerCase() !== email && !isAccountSuspended(referrer.suspended, referrer.suspendedUntil)) {
        await tx.insert(referrals).values({ referrerId: referrer.id, referredUserId: nu.id, code: invitedBy, status: "registered" }).onConflictDoNothing();
      }
    }
    return nu;
  }).catch(e => pgCode(e) === "23505" ? null : Promise.reject(e));

  if (!u) return { error: "exists" };
  try { await sendVerificationForNewUser(u.id); } catch { return { error: "email_setup_needed" }; }
  return { error: "email_sent" };
}

export async function logout() { await destroySession(); redirect("/"); }

export async function bookLesson(fd: FormData) {
  const u = await getUser();
  if (!u) redirect("/login");
  const teacherId = Number(fd.get("teacherId"));
  if (u.role !== "student" || !Number.isInteger(teacherId)) redirect("/teachers");
  if (!await hit(`book:${u.id}`, 30, 3600_000)) redirect(`/teachers/${teacherId}?err=rate`);
  let error = "";
  try {
    await reserveLesson(u.id, {
      teacherId, startAt: new Date(str(fd, "startAt", 40)),
      duration: Number(fd.get("duration") || 50), trial: fd.get("trial") === "1",
      packageId: Number(fd.get("packageId")) || undefined, topic: str(fd, "topic", 200),
      classType: fd.get("classType") === "semi_private" ? "semi_private" : "private",
      groupLessonId: Number(fd.get("groupLessonId")) || undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "generic";
    error = ["balance", "slot", "credit", "trial", "group_unavailable", "group_full", "group_already_joined", "group_payment"].includes(msg) ? msg : pgCode(e) === "23505" ? "slot" : "generic";
  }
  if (error) redirect(`/teachers/${teacherId}?err=${error}`);
  redirect("/dashboard?tab=lessons&ok=booked");
}

export async function updateLesson(fd: FormData) {
  const u = await getUser();
  if (!u) redirect("/login");
  const id = Number(fd.get("id"));
  if (!Number.isInteger(id)) return;
  const action = str(fd, "action", 10);
  const changed = await changeLessonStatus(u.id, id, action, str(fd, "notes", 1000)).catch(() => false);
  if (changed && action === "complete") updateTag(PUBLIC_TUTORS_TAG);
  revalidatePath("/dashboard");
  revalidatePath(`/classroom/${id}`);
}

export async function leaveReview(fd: FormData) {
  const u = await getUser();
  if (!u) redirect("/login");
  if (u.role !== "student") return;
  const id = Number(fd.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return;
  const rating = Math.min(5, Math.max(1, Math.round(Number(fd.get("rating"))) || 5));
  const [l] = await db.select().from(lessons).where(eq(lessons.id, id)).limit(1);
  if (!l || l.status !== "completed" || !(await canAccessLesson(id, u.id))) return;
  const inserted = await db.transaction(async tx => {
    const [created] = await tx.insert(reviews).values({ lessonId: id, studentId: u.id, teacherId: l.teacherId, rating, comment: str(fd, "comment", 1000) })
      .onConflictDoNothing().returning({ id: reviews.id });
    if (!created) return false;
    if (l.studentId === u.id) await tx.update(lessons).set({ reviewed: true }).where(eq(lessons.id, id));
    const [agg] = await tx.select({ avg: sql<number>`avg(${reviews.rating})::float`, n: sql<number>`count(*)::int` }).from(reviews).where(eq(reviews.teacherId, l.teacherId));
    await tx.update(teacherProfiles).set({ rating: Math.round(Number(agg.avg || 0) * 100) / 100, reviewsCount: Number(agg.n || 0) }).where(eq(teacherProfiles.userId, l.teacherId));
    return true;
  }).catch(() => false);
  if (inserted) { updateTag(PUBLIC_TUTORS_TAG); revalidatePath("/dashboard"); revalidatePath(`/teachers/${l.teacherId}`); }
}

export async function sendMessage(fd: FormData) {
  const u = await getUser();
  if (!u) redirect("/login");
  const to = Number(fd.get("to"));
  const body = str(fd, "body", 2000);
  if (body && Number.isInteger(to) && to !== u.id && await hit(`msg:${u.id}`, 40, 60_000)) {
    const [r] = await db.select({ id: users.id }).from(users).where(eq(users.id, to));
    if (r) await db.insert(messages).values({ fromId: u.id, toId: to, body });
  }
  redirect(`/dashboard?tab=messages&with=${Number.isInteger(to) ? to : ""}`);
}

export async function topUp(fd: FormData) {
  const u = await getUser();
  if (!u || u.role !== "student") redirect("/login");
  const amount = Number(fd.get("amount"));
  if (![2000, 5000, 10000, 20000].includes(amount)) redirect("/dashboard?tab=wallet");
  if (!await hit(`topup:${u.id}`, 10, 3600_000)) redirect("/dashboard?tab=wallet&err=rate");
  const key = (await getIntegrationConfig()).payments.secretKey;
  if (key) {
    const h = await headers();
    const origin = process.env.APP_URL || `${h.get("x-forwarded-proto") || "https"}://${h.get("x-forwarded-host") || h.get("host")}`;
    const body = new URLSearchParams({
      mode: "payment", "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][price_data][product_data][name]": "Lingorain wallet top-up",
      "line_items[0][quantity]": "1",
      "metadata[user_id]": String(u.id), "metadata[amount]": String(amount),
      success_url: `${origin}/dashboard?tab=wallet&ok=paid`, cancel_url: `${origin}/dashboard?tab=wallet`,
    });
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json() as { url?: string };
    if (!res.ok || !data.url) redirect("/dashboard?tab=wallet&err=generic");
    redirect(data.url);
  }
  if (!demoPaymentsEnabled()) redirect("/dashboard?tab=wallet&err=payments");
  await db.transaction(async tx => {
    await tx.update(users).set({ balance: sql`${users.balance} + ${amount}` }).where(eq(users.id, u.id));
    await ledger(tx, u.id, "topup", amount, "Demo top-up");
  });
  redirect("/dashboard?tab=wallet&ok=paid");
}

export async function requestPayout(fd: FormData) {
  const u = await getUser();
  if (!u || u.role !== "teacher") redirect("/login");
  const amount = Math.round(Number(fd.get("amount")) * 100);
  const method = str(fd, "method", 20);
  const accountInput = str(fd, "account", 200);
  if (!["Bank", "PayPal", "Alipay", "Wise", "PayPay"].includes(method) || (accountInput.length > 0 && accountInput.length < 4) || accountInput.length > 200 || !Number.isFinite(amount) || !Number.isSafeInteger(amount) || amount < MIN_PAYOUT) redirect("/dashboard?tab=wallet&err=payout");
  if (!await hit(`payout:${u.id}`, 5, 3600_000)) redirect("/dashboard?tab=wallet&err=rate");
  let ok = false;
  try {
    await db.transaction(async tx => {
      const [profile] = await tx.select({ payoutAccount: teacherProfiles.payoutAccount })
        .from(teacherProfiles).where(eq(teacherProfiles.userId, u.id)).for("update");
      let account = accountInput ? encryptPayoutAccount(accountInput) : (profile?.payoutAccount || "");
      if (account && !isEncryptedPayoutAccount(account)) account = encryptPayoutAccount(account); // encrypt legacy profile value on use
      if (!account) throw new Error("payout_account_required");
      const r = await tx.update(users).set({ balance: sql`${users.balance} - ${amount}` })
        .where(and(eq(users.id, u.id), sql`${users.balance} >= ${amount}`)).returning({ id: users.id });
      if (!r.length) return;
      await tx.insert(payouts).values({ teacherId: u.id, amount, method, account });
      await ledger(tx, u.id, "payout", -amount, `${method} withdrawal`);
      await tx.update(teacherProfiles).set({ payoutMethod: method, payoutAccount: account }).where(eq(teacherProfiles.userId, u.id));
      ok = true;
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "payout_account_required" || error.message.includes("PAYOUT_ENCRYPTION_KEY"))) redirect("/dashboard?tab=wallet&err=payout_config");
    throw error;
  }
  redirect(ok ? "/dashboard?tab=wallet&ok=payout" : "/dashboard?tab=wallet&err=balance");
}

export async function setLessonPlatform(fd: FormData) {
  const u = await getUser();
  if (!u) redirect("/login");
  const id = Number(fd.get("id"));
  let error = "";
  try { await chooseClassroom(u.id, id, str(fd, "platform", 10), str(fd, "meetingUrl", 1000)); }
  catch (e) { error = e instanceof Error ? e.message : "generic"; }
  if (error) redirect(`/dashboard?tab=lessons&err=${error}`);
  revalidatePath("/dashboard");
  redirect(`/classroom/${id}`);
}

export async function updateProfile(fd: FormData) {
  const u = await getUser();
  if (!u) redirect("/login");
  await db.update(users).set({
    name: str(fd, "name", 60) || u.name,
    level: ["A1", "A2", "B1", "B2", "C1", "C2"].includes(str(fd, "level", 2)) ? str(fd, "level", 2) : u.level,
    nativeLang: ["zh", "ja", "en"].includes(str(fd, "nativeLang", 2)) ? str(fd, "nativeLang", 2) : u.nativeLang,
    timeZone: isValidTimeZone(str(fd, "timeZone", 64)) ? str(fd, "timeZone", 64) : (u.timeZone || "UTC"),
  }).where(eq(users.id, u.id));
  if (u.role === "teacher") {
    const start = Math.min(23, Math.max(0, Math.round(Number(fd.get("startHour")) || 9)));
    const end = Math.min(24, Math.max(start + 1, Math.round(Number(fd.get("endHour")) || 21)));
    const days = fd.getAll("workDays").map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6);
    await db.update(teacherProfiles).set({
      headline: str(fd, "headline", 140), bio: str(fd, "bio", 2000),
      country: ["US", "GB", "CA", "AU", "IE", "NZ", "ZA", "CN", "JP"].includes(str(fd, "country", 2)) ? str(fd, "country", 2) : "US",
      accent: str(fd, "accent", 40), speaks: str(fd, "speaks", 80) || "English", tags: str(fd, "tags", 120),
      price: Math.min(50000, Math.max(500, Math.round(Number(fd.get("price") || 25) * 100))),
      startHour: start, endHour: end,
      tzOffset: Math.min(14, Math.max(-12, Math.round(Number(fd.get("tzOffset")) || 0))),
      timeZone: isValidTimeZone(str(fd, "teacherTimeZone", 64)) ? str(fd, "teacherTimeZone", 64) : (u.timeZone || "UTC"),
      workDays: days.length ? days.join(",") : "1,2,3,4,5",
      platformDefault: ["lingo", "meet", "zoom"].includes(str(fd, "platformDefault", 10)) ? str(fd, "platformDefault", 10) : "lingo",
    }).where(eq(teacherProfiles.userId, u.id));
    updateTag(PUBLIC_TUTORS_TAG);
  }
  redirect("/dashboard?tab=profile&ok=saved");
}