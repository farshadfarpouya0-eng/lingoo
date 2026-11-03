import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { HOME } from "./home-i18n";

export type Stat = { value: string; label: string };
export type Goal = { tag: string; title: string; text: string };
export type Character = { name: string; activity: string; text: string; image: string; alt: string };
export type Detail = { kicker: string; title: string; text: string; bullets: string[]; stat: string; statLabel: string; image: string; alt: string };
export type Step = { title: string; text: string };
export type Why = { title: string; text: string };
export type PromiseItem = { value: string; title: string; text: string };
export type CmpRow = { label: string; us: string; them: string };
export type Review = { name: string; from: string; text: string; goal: string };
export type Faq = { q: string; a: string };

export type HomeContent = {
  hero: { badge: string; titleA: string; titleB: string; subtitle: string; image: string; imageAlt: string };
  stats: Stat[];
  searchGoal: string; searchBtn: string; searchPlaceholder: string; popular: string; trust: string;
  goals: { title: string; subtitle: string; items: Goal[] };
  kids: { title: string; subtitle: string; cta: string; characters: Character[] };
  details: { title: string; subtitle: string; items: Detail[] };
  how: { title: string; subtitle: string; steps: Step[] };
  why: { title: string; subtitle: string; items: Why[] };
  promises: { title: string; subtitle: string; items: PromiseItem[] };
  compare: { title: string; us: string; them: string; rows: CmpRow[] };
  reviews: { title: string; items: Review[] };
  faq: { title: string; items: Faq[] };
  ctaTutor: { title: string; text: string; button: string; points: string[] };
  final: { title: string; button: string };
  footer: { tagline: string; contactEmail: string };
  announcement: { enabled: boolean; text: string };
};
export type Settings = { siteName: string; footerTagline: string; contactEmail: string; announcement: { enabled: boolean; text: string } };

const DEFAULT_HERO = { en: "/images/hero-online.webp", zh: "/images/hero-online.webp", ja: "/images/hero-online.webp" };
const DEFAULT_TAGLINE = { en: "English learning made for Asia.", zh: "为亚洲学习者打造的英语学习平台。", ja: "アジアのための英語学習プラットフォーム。" };
const DEFAULT_EMAIL = "hello@lingorain.com";

export type ContentStore = { en: HomeContent; zh: HomeContent; ja: HomeContent };
export function defaultContentStore(): ContentStore {
  return { en: defaultContentFor("en"), zh: defaultContentFor("zh"), ja: defaultContentFor("ja") };
}
export function defaultContentFor(lang: "en" | "zh" | "ja"): HomeContent {
  const h = HOME[lang];
  return {
    hero: { badge: h.badge, titleA: h.h1a, titleB: h.h1b, subtitle: h.sub, image: DEFAULT_HERO[lang], imageAlt: lang === "ja" ? "オンライン英語レッスン" : "Online English lesson" },
    stats: h.stats.map(([value, label]) => ({ value, label })),
    searchGoal: h.searchGoal, searchBtn: h.searchBtn, searchPlaceholder: h.searchPlaceholder, popular: h.popular, trust: h.trust,
    goals: { title: h.goalsTitle, subtitle: h.goalsSub, items: h.goals.map(g => ({ tag: g.tag, title: g.title, text: g.text })) },
    kids: { title: h.kidsTitle, subtitle: h.kidsSub, cta: h.kidsCta, characters: h.characters.map(c => ({ name: c.name, activity: c.activity, text: c.text, image: c.image, alt: c.alt })) },
    details: { title: h.detailTitle, subtitle: h.detailSub, items: h.details.map(d => ({ kicker: d.kicker, title: d.title, text: d.text, bullets: [...d.bullets], stat: d.stat, statLabel: d.statLabel, image: d.image, alt: d.alt })) },
    how: { title: h.howTitle, subtitle: h.howSub, steps: h.steps.map(s => ({ title: s.title, text: s.text })) },
    why: { title: h.whyTitle, subtitle: h.whySub, items: h.why.map(w => ({ title: w.title, text: w.text })) },
    promises: { title: h.promiseTitle, subtitle: h.promiseSub, items: h.promises.map(p => ({ value: p.value, title: p.title, text: p.text })) },
    compare: { title: h.cmpTitle, us: h.cmpUs, them: h.cmpThem, rows: h.cmpRows.map(([label, us, them]) => ({ label, us, them })) },
    reviews: { title: h.revTitle, items: h.reviews.map(r => ({ name: r.name, from: r.from, text: r.text, goal: r.goal })) },
    faq: { title: h.faqTitle, items: h.faq.map(([q, a]) => ({ q, a })) },
    ctaTutor: { title: h.ctaTutorTitle, text: h.ctaTutorText, button: h.ctaTutorBtn, points: [...h.ctaTutorPoints] },
    final: { title: h.finalTitle, button: h.finalBtn },
    footer: { tagline: DEFAULT_TAGLINE[lang], contactEmail: DEFAULT_EMAIL },
    announcement: { enabled: false, text: "" },
  };
}

export type Lang = "en" | "zh" | "ja";
function clone<T>(o: T): T { return JSON.parse(JSON.stringify(o)); }

/** Merge DB overrides over defaults, normalizing arrays safely. */
function merge(base: HomeContent, raw: any): HomeContent {
  if (!raw || typeof raw !== "object") return clone(base);
  const out = clone(base);
  const obj = (key: string) => { if (raw[key] && typeof raw[key] === "object") (out as any)[key] = { ...(out as any)[key], ...raw[key] }; };
  const arr = (key: keyof HomeContent, mapIt: (r: any, def: any, i: number) => any) => {
    const rv = (raw as any)[key];
    const bv = (base as any)[key];
    const arrBase = bv && typeof bv === "object" && "items" in bv ? bv.items : bv;
    if (Array.isArray(rv)) (out as any)[key] = Array.isArray(arrBase) ? arrBase.map((def: any, i: number) => mapIt(rv[i], def, i)) : arrBase;
  };
  obj("hero"); obj("goals"); obj("kids"); obj("details"); obj("how"); obj("why"); obj("promises"); obj("compare"); obj("reviews"); obj("faq"); obj("ctaTutor"); obj("final"); obj("footer"); obj("announcement");
  arr("stats", (r, d) => ({ value: String(r?.value ?? r?.[0] ?? d?.value ?? ""), label: String(r?.label ?? r?.[1] ?? d?.label ?? "") }));
  arr("goals", (r, d) => ({ ...d, ...(r && typeof r === "object" ? r : {}) }));
  arr("kids", (r, d) => {
    if (!r || typeof r !== "object") return d;
    const k = { ...d }; if (r.title) k.title = r.title; if (r.subtitle) k.subtitle = r.subtitle; if (r.cta) k.cta = r.cta; if (Array.isArray(r.characters)) k.characters = d.characters.map((c: any, i: number) => ({ ...c, ...(r.characters[i] && typeof r.characters[i] === "object" ? r.characters[i] : {}) })); return k;
  });
  arr("details", (r, d) => ({ ...d, ...(r && typeof r === "object" ? { ...r, bullets: Array.isArray(r.bullets) ? r.bullets.map(String) : d.bullets } : {}) }));
  arr("how", (r, d) => ({ ...d, ...(r && typeof r === "object" ? { ...r, steps: Array.isArray(r.steps) ? d.steps.map((s: any, i: number) => ({ ...s, ...(r.steps[i] && typeof r.steps[i] === "object" ? r.steps[i] : {}) })) : d.steps } : {}) }));
  arr("why", (r, d) => ({ ...d, ...(r && typeof r === "object" ? { ...r, items: Array.isArray(r.items) ? d.items.map((s: any, i: number) => ({ ...s, ...(r.items[i] && typeof r.items[i] === "object" ? r.items[i] : {}) })) : d.items } : {}) }));
  arr("promises", (r, d) => ({ ...d, ...(r && typeof r === "object" ? { ...r, items: Array.isArray(r.items) ? d.items.map((s: any, i: number) => ({ ...s, ...(r.items[i] && typeof r.items[i] === "object" ? r.items[i] : {}) })) : d.items } : {}) }));
  arr("compare", (r, d) => ({ ...d, ...(r && typeof r === "object" ? { ...r, rows: Array.isArray(r.rows) ? d.rows.map((s: any, i: number) => ({ ...s, ...(r.rows[i] && typeof r.rows[i] === "object" ? r.rows[i] : {}) })) : d.rows } : {}) }));
  arr("reviews", (r, d) => ({ ...d, ...(r && typeof r === "object" ? { ...r, items: Array.isArray(r.items) ? d.items.map((s: any, i: number) => ({ ...s, ...(r.items[i] && typeof r.items[i] === "object" ? r.items[i] : {}) })) : d.items } : {}) }));
  arr("faq", (r, d) => ({ ...d, ...(r && typeof r === "object" ? { ...r, items: Array.isArray(r.items) ? d.items.map((s: any, i: number) => ({ ...s, ...(r.items[i] && typeof r.items[i] === "object" ? r.items[i] : {}) })) : d.items } : {}) }));
  arr("ctaTutor", (r, d) => ({ ...d, ...(r && typeof r === "object" ? { ...r, points: Array.isArray(r.points) ? d.points.map((s: string, i: number) => String(r.points[i] ?? s)) : d.points } : {}) }));
  // flat scalars
  if (typeof raw.searchGoal === "string") out.searchGoal = raw.searchGoal;
  if (typeof raw.searchBtn === "string") out.searchBtn = raw.searchBtn;
  if (typeof raw.searchPlaceholder === "string") out.searchPlaceholder = raw.searchPlaceholder;
  if (typeof raw.popular === "string") out.popular = raw.popular;
  if (typeof raw.trust === "string") out.trust = raw.trust;
  if (raw.hero && typeof raw.hero === "object") out.hero = { ...base.hero, ...raw.hero };
  return out;
}

async function getStore(): Promise<{ content: ContentStore; settings: Settings }> {
  const rows = await db.select().from(siteSettings).catch(() => [] as any[]);
  const map: Record<string, any> = {};
  for (const r of rows as any[]) map[r.key] = r.value;
  const content: ContentStore = { en: merge(defaultContentFor("en"), map.content?.en), zh: merge(defaultContentFor("zh"), map.content?.zh), ja: merge(defaultContentFor("ja"), map.content?.ja) };
  const s = map.settings || {};
  const settings: Settings = {
    siteName: typeof s.siteName === "string" ? s.siteName : "Lingorain",
    contactEmail: typeof s.contactEmail === "string" ? s.contactEmail : "hello@lingorain.com",
    footerTagline: typeof s.footerTagline === "string" ? s.footerTagline : content.en.footer.tagline,
    announcement: typeof s.announcement === "object" ? { enabled: !!s.announcement.enabled, text: typeof s.announcement.text === "string" ? s.announcement.text : "" } : { enabled: false, text: "" },
  };
  return { content, settings };
}

export async function getSiteContent() { return getStore(); }
export async function getContentFor(lang: Lang) { const { content } = await getStore(); return content[lang]; }
export async function getSettingsFor(lang: Lang) {
  const { settings, content } = await getStore();
  return { ...settings, footerTagline: content[lang].footer.tagline, announcement: { ...settings.announcement, text: (settings.announcement.text as any)?.[lang] ?? (typeof settings.announcement.text === "string" ? settings.announcement.text : "") } };
}

async function upsert(key: string, value: any) {
  await db.insert(siteSettings).values({ key, value, updatedAt: new Date() }).onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date() } });
}
export async function saveContent(lang: Lang, content: HomeContent) {
  const { content: store } = await getStore();
  await upsert("content", { ...store, [lang]: content });
  revalidateAll();
}
export async function saveSettings(settings: Settings) {
  await upsert("settings", settings);
  revalidateAll();
}
export async function saveContentAndSettings(lang: Lang, content: HomeContent, settings: Settings) {
  const { content: store } = await getStore();
  await upsert("content", { ...store, [lang]: content });
  await upsert("settings", settings);
  revalidateAll();
}
export async function resetContent(lang: Lang) {
  const { content: store } = await getStore();
  await upsert("content", { ...store, [lang]: defaultContentFor(lang) });
  revalidateAll();
}
function revalidateAll() { revalidatePath("/", "layout"); revalidatePath("/teachers"); revalidatePath("/dashboard"); revalidatePath("/admin"); }
import { revalidatePath } from "next/cache";
