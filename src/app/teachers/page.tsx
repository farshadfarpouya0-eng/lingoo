import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, lte, or } from "drizzle-orm";
import { teacherProfiles, users } from "@/db/schema";
import { teacherQuery } from "@/lib/queries";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { getPricingConfig } from "@/lib/pricing-config";
import { money } from "@/lib/package-pricing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose an English teacher" };

export default async function TeachersPage() {
  const user = await getUser();
  if (!user) redirect("/register?role=student");
  if (user.role !== "student") redirect("/dashboard");
  const [{ lang }, pricing, teachers] = await Promise.all([
    getT(), getPricingConfig(),
    teacherQuery()
      .where(and(eq(users.role, "teacher"), eq(teacherProfiles.active, true), or(eq(users.suspended, false), lte(users.suspendedUntil, new Date()))))
      .orderBy(desc(teacherProfiles.rating), desc(teacherProfiles.reviewsCount))
      .limit(60),
  ]);
  const copy = lang === "zh"
    ? { eyebrow: "Lingorain 教师", title: "选择你的英语老师", sub: "无需参加水平测试。浏览老师资料，选择适合你的老师并预约课程。", choose: "查看资料并预约", empty: "目前没有可预约的老师。", lessons: "节课", reviews: "条评价", speaks: "授课语言" }
    : lang === "ja"
      ? { eyebrow: "Lingorain 講師", title: "英語講師を選ぶ", sub: "レベルテストは不要です。講師のプロフィールを確認し、好きな講師のレッスンを予約できます。", choose: "プロフィール・予約を見る", empty: "現在、予約可能な講師はいません。", lessons: "レッスン", reviews: "レビュー", speaks: "対応言語" }
      : { eyebrow: "LINGORAIN TEACHERS", title: "Choose your English teacher", sub: "No placement test required. Explore teacher profiles, choose someone who fits your goals and book a lesson.", choose: "View profile & book", empty: "There are no available teachers right now.", lessons: "lessons", reviews: "reviews", speaks: "Speaks" };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-700">{copy.eyebrow}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-teal-950 sm:text-4xl">{copy.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">{copy.sub}</p>
      {!teachers.length ? <p className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">{copy.empty}</p> : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {teachers.map((teacher) => (
            <article key={teacher.id} className="flex flex-col rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                {teacher.avatar ? <img src={teacher.avatar} alt="" width={60} height={60} className="h-[60px] w-[60px] shrink-0 rounded-2xl object-cover" /> : <span className="grid h-[60px] w-[60px] shrink-0 place-items-center rounded-2xl bg-teal-50 text-xl font-bold text-teal-800">{teacher.name[0]}</span>}
                <div className="min-w-0 flex-1"><h2 className="truncate font-bold text-teal-950">{teacher.name}</h2><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{teacher.headline || teacher.bio}</p></div>
                <div className="text-right"><p className="text-sm font-bold text-amber-600">★ {Number(teacher.rating).toFixed(1)}</p><p className="text-[10px] text-slate-400">{teacher.reviewsCount} {copy.reviews}</p></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500"><span>{copy.speaks}: {teacher.speaks}</span>{teacher.certified && <span className="rounded-full bg-teal-50 px-2 py-0.5 font-semibold text-teal-700">Verified</span>}</div>
              <div className="mt-auto flex items-end justify-between gap-3 pt-5"><div><p className="text-[10px] text-slate-400">{teacher.lessonsCount} {copy.lessons}</p><p className="mt-1 text-lg font-bold text-teal-950">{money(pricing.student50)}<span className="ml-1 text-[10px] font-normal text-slate-400">/ 50 min</span></p></div><Link href={`/teachers/${teacher.id}`} className="rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-teal-900">{copy.choose}</Link></div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
