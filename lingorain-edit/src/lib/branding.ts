import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import type { Lang } from "./i18n";

export const BRANDING_KEY = "branding";
/** Max length of the stored logo value (an uploaded logo is a base64 data URL). */
export const LOGO_MAX = 300_000;

export type Localized = Record<Lang, string>;

export type Branding = {
  brandName: string;
  logoUrl: string;
  heroTitle: Localized;
  heroAccent: Localized;
  intro: Localized;
  footerNote: Localized;
};

export const DEFAULT_BRANDING: Branding = {
  brandName: "Lingorain",
  logoUrl: "",
  heroTitle: { en: "Find an English tutor", zh: "找到你的英语老师", ja: "あなたに合う英語講師を" },
  heroAccent: { en: "for every chapter.", zh: "每个阶段，都能进步。", ja: "どの学びのステージにも。" },
  intro: {
    en: "A new opportunity for you. A world of possibilities for your child. Personal lessons, at your pace.",
    zh: "为你开启新机会，为孩子打开新世界。专属课程，按自己的节奏学习。",
    ja: "あなたの新しいチャンス、お子さまの未来の可能性。それぞれのペースで学べます。",
  },
  footerNote: {
    en: "One-to-one learning, for you and your family.",
    zh: "为你和家人打造的一对一英语学习。",
    ja: "あなたと家族のためのマンツーマン英語。",
  },
};

const LANGS: Lang[] = ["en", "zh", "ja"];
const DATA_LOGO = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;

function readString(v: unknown, fallback: string, max: number): string {
  if (typeof v !== "string") return fallback;
  const s = v.trim().slice(0, max);
  return s || fallback;
}

function readLocalized(v: unknown, fallback: Localized, max: number): Localized {
  const src = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const out = { ...fallback };
  for (const l of LANGS) out[l] = readString(src[l], fallback[l], max);
  return out;
}

/** Accepts an uploaded image (data URL), a site path (/images/logo.svg) or an https:// link. */
export function isValidLogoUrl(v: string): boolean {
  if (!v) return true;
  if (v.startsWith("data:")) return v.length <= LOGO_MAX && DATA_LOGO.test(v);
  if (v.length > 500) return false;
  if (v.startsWith("/")) return !v.includes("..") && !v.startsWith("//");
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

/** site_settings.value is jsonb (object); a JSON string from older saves is accepted too. */
export function parseBranding(raw: unknown): Branding {
  if (raw === null || raw === undefined) return DEFAULT_BRANDING;
  let json: unknown = raw;
  if (typeof raw === "string") {
    try { json = JSON.parse(raw); } catch { return DEFAULT_BRANDING; }
  }
  if (!json || typeof json !== "object") return DEFAULT_BRANDING;

  const src = json as Record<string, unknown>;
  const logo = typeof src.logoUrl === "string" ? src.logoUrl.trim() : "";
  return {
    brandName: readString(src.brandName, DEFAULT_BRANDING.brandName, 40),
    logoUrl: isValidLogoUrl(logo) ? logo : "",
    heroTitle: readLocalized(src.heroTitle, DEFAULT_BRANDING.heroTitle, 120),
    heroAccent: readLocalized(src.heroAccent, DEFAULT_BRANDING.heroAccent, 120),
    intro: readLocalized(src.intro, DEFAULT_BRANDING.intro, 400),
    footerNote: readLocalized(src.footerNote, DEFAULT_BRANDING.footerNote, 200),
  };
}

/** Raw branding (the admin form needs the real stored logo). Falls back to defaults on any DB error. */
export async function getBranding(): Promise<Branding> {
  try {
    const [row] = await db.select({ value: siteSettings.value }).from(siteSettings)
      .where(eq(siteSettings.key, BRANDING_KEY)).limit(1);
    return parseBranding(row?.value);
  } catch {
    return DEFAULT_BRANDING;
  }
}

/** An uploaded logo is served from /api/brand-logo with a content hash, so pages stay small and cache well. */
export function publicLogoSrc(logoUrl: string): string {
  if (!logoUrl.startsWith("data:")) return logoUrl;
  const v = createHash("sha1").update(logoUrl).digest("hex").slice(0, 12);
  return `/api/brand-logo?v=${v}`;
}

/** Branding for public pages: the logo points at a cacheable URL instead of inline base64. */
export async function getPublicBranding(): Promise<Branding> {
  const b = await getBranding();
  return { ...b, logoUrl: publicLogoSrc(b.logoUrl) };
}
