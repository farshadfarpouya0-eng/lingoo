import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import type { Lang } from "./i18n";

export const BRANDING_KEY = "branding";

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
  heroTitle: {
    en: "Find an English tutor",
    zh: "找到你的英语老师",
    ja: "あなたに合う英語講師を",
  },
  heroAccent: {
    en: "for every chapter.",
    zh: "每个阶段，都能进步。",
    ja: "どの学びのステージにも。",
  },
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

/**
 * site_settings.value is a jsonb column, so it normally arrives as an object.
 * A JSON string (older saves) is accepted too.
 */
export function parseBranding(raw: unknown): Branding {
  if (raw === null || raw === undefined) return DEFAULT_BRANDING;

  let json: unknown = raw;
  if (typeof raw === "string") {
    try { json = JSON.parse(raw); } catch { return DEFAULT_BRANDING; }
  }
  if (!json || typeof json !== "object") return DEFAULT_BRANDING;

  const src = json as Record<string, unknown>;
  return {
    brandName: readString(src.brandName, DEFAULT_BRANDING.brandName, 40),
    logoUrl: readString(src.logoUrl, "", 500),
    heroTitle: readLocalized(src.heroTitle, DEFAULT_BRANDING.heroTitle, 120),
    heroAccent: readLocalized(src.heroAccent, DEFAULT_BRANDING.heroAccent, 120),
    intro: readLocalized(src.intro, DEFAULT_BRANDING.intro, 400),
    footerNote: readLocalized(src.footerNote, DEFAULT_BRANDING.footerNote, 200),
  };
}

/** Read branding. Any DB problem falls back to defaults so the site never breaks. */
export async function getBranding(): Promise<Branding> {
  try {
    const [row] = await db
      .select({ value: siteSettings.value })
      .from(siteSettings)
      .where(eq(siteSettings.key, BRANDING_KEY))
      .limit(1);
    return parseBranding(row?.value);
  } catch {
    return DEFAULT_BRANDING;
  }
}

export function isValidLogoUrl(v: string): boolean {
  if (!v) return true;
  if (v.startsWith("/")) return !v.includes("..") && !v.startsWith("//");
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}
