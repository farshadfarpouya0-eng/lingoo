import { asc, desc, ilike, lte, or, and, eq, not, sql, type SQL } from "drizzle-orm";
import { teacherProfiles, users } from "@/db/schema";
import { getT } from "@/lib/i18n";
import { LANDING } from "@/lib/landing-i18n";
import { ensureSeed } from "@/lib/seed";
import { teacherQuery } from "@/lib/queries";
import TeacherCard from "@/components/TeacherCard";
import Link from "next/link";
export const dynamic="force-dynamic";
export const metadata={title:"Find tutors"};
const TAGS=["Conversation","IELTS","TOEFL","TOEIC","Business","Kids","Pronunciation","Interview","Grammar","Writing","Travel"];
const esc=(s:string)=>s.replace(/[\\%_]/g,"\\$&").slice(0,60);
export default async function Teachers({searchParams}:{searchParams:Promise<{q?:string;tag?:string;sort?:string;speaks?:string;audience?:string}>}){
  await ensureSeed();
  const {t,lang}=await getT();const c=LANDING[lang];
  const {q="",tag="",sort="rating",speaks="",audience=""}=await searchParams;
  const conds:SQL[]=[eq(users.role,"teacher"),eq(teacherProfiles.active,true),or(eq(users.suspended,false),lte(users.suspendedUntil,new Date()))!];
  if(audience==="kids")conds.push(ilike(teacherProfiles.tags,"%Kids%"));
  else if(audience==="adults")conds.push(not(ilike(teacherProfiles.tags,"%Kids%")));
  if(q)conds.push(or(ilike(users.name,`%${esc(q)}%`),ilike(teacherProfiles.headline,`%${esc(q)}%`),ilike(teacherProfiles.tags,`%${esc(q)}%`))!);
  if(TAGS.includes(tag))conds.push(ilike(teacherProfiles.tags,`%${tag}%`));
  if(speaks==="zh")conds.push(or(ilike(teacherProfiles.speaks,"%Mandarin%"),ilike(teacherProfiles.speaks,"%Cantonese%"),ilike(teacherProfiles.speaks,"%Chinese%"))!);
  if(speaks==="ja")conds.push(ilike(teacherProfiles.speaks,"%Japanese%"));
  // Bayesian rating avoids putting a brand-new 5.0 profile above a tutor with a reliable review history.
  const ratingRank = sql<number>`((${teacherProfiles.rating} * ${teacherProfiles.reviewsCount} + 4.5 * 5.0) / (${teacherProfiles.reviewsCount} + 5.0))`;
  const order=sort==="low"?asc(teacherProfiles.price):sort==="high"?desc(teacherProfiles.price):sort==="popular"?desc(teacherProfiles.lessonsCount):desc(ratingRank);
  const list=await teacherQuery().where(and(...conds)).orderBy(order).limit(60);
  const qs=(o:Record<string,string>)=>"?"+new URLSearchParams({q,tag,sort,speaks,audience,...o}).toString();
  const pill=(on:boolean)=>`rounded-full px-4 py-2 text-xs font-semibold transition ${on?"bg-teal-800 text-white":"border border-slate-200 bg-white text-slate-500 hover:border-teal-400"}`;
  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10"><p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-teal-700">{audience==="kids"?c.kidsNav:audience==="adults"?c.adultNav:c.allTutors}</p><h1 className="text-3xl font-bold tracking-tight text-teal-950 sm:text-4xl">{t.findTeachers}</h1><div className="mt-6 flex flex-wrap gap-2"><Link href={qs({audience:"",tag:""})} className={pill(!audience)}>{c.allAges}</Link><Link href={qs({audience:"adults",tag:tag==="Kids"?"":tag})} className={pill(audience==="adults")}>{c.adultsOption}</Link><Link href={qs({audience:"kids",tag:"Kids"})} className={pill(audience==="kids")}>{c.kidsOption}</Link></div><form className="mt-5 flex flex-col gap-3 sm:flex-row"><input name="q" defaultValue={q} maxLength={60} placeholder={t.search} aria-label={t.search} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-teal-500"/><input type="hidden" name="tag" value={tag}/><input type="hidden" name="speaks" value={speaks}/><input type="hidden" name="audience" value={audience}/><select name="sort" aria-label={t.sortBy} defaultValue={sort} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"><option value="rating">{t.sortRating}</option><option value="popular">{t.sortPopular}</option><option value="low">{t.sortPriceLow}</option><option value="high">{t.sortPriceHigh}</option></select><button className="rounded-xl bg-teal-800 px-6 py-3 text-sm font-bold text-white hover:bg-teal-900">{c.search}</button></form><div className="mt-5 flex flex-wrap gap-2"><Link href={qs({tag:""})} className={pill(!tag)}>{t.allTags}</Link>{TAGS.filter(g=>audience!=="adults"||g!=="Kids").map(g=><Link key={g} href={qs({tag:g})} className={pill(tag===g)}>{g}</Link>)}</div><div className="mt-3 flex flex-wrap gap-2"><Link href={qs({speaks:""})} className={pill(!speaks)}>{t.speaksAny}</Link><Link href={qs({speaks:"zh"})} className={pill(speaks==="zh")}>{t.speaksZh}</Link><Link href={qs({speaks:"ja"})} className={pill(speaks==="ja")}>{t.speaksJa}</Link></div><div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{list.map(f=><TeacherCard key={f.id} tr={f} t={t}/>)}</div>{!list.length&&<p className="py-16 text-center text-sm text-slate-400">{t.noResults}</p>}</div>;
}
