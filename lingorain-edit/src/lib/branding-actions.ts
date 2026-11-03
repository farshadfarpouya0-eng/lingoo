"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { BRANDING_KEY, DEFAULT_BRANDING, LOGO_MAX, isValidLogoUrl, type Branding } from "@/lib/branding";

type R = { ok?: boolean; error?: string };

const field = (fd: FormData, key: string, max: number, fallback = "") => {
  const v = String(fd.get(key) ?? "").trim().slice(0, max);
  return v || fallback;
};

/** site_settings.value is jsonb — store the object itself, and bump updated_at. */
async function writeBranding(value: Branding) {
  const now = new Date();
  await db.insert(siteSettings)
    .values({ key: BRANDING_KEY, value, updatedAt: now })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: now } });
  revalidatePath("/", "layout");
  revalidatePath("/admin/branding");
}

export async function saveBranding(_prev: R, fd: FormData): Promise<R> {
  await requireAdmin();

  const rawLogo = String(fd.get("logoUrl") ?? "").trim();
  if (rawLogo.length > LOGO_MAX) return { ok: false, error: "logo_size" };
  if (!isValidLogoUrl(rawLogo)) return { ok: false, error: "logo" };

  const d = DEFAULT_BRANDING;
  const next: Branding = {
    brandName: field(fd, "brandName", 40, d.brandName),
    logoUrl: rawLogo,
    heroTitle: {
      en: field(fd, "heroTitle_en", 120, d.heroTitle.en),
      zh: field(fd, "heroTitle_zh", 120, d.heroTitle.zh),
      ja: field(fd, "heroTitle_ja", 120, d.heroTitle.ja),
    },
    heroAccent: {
      en: field(fd, "heroAccent_en", 120, d.heroAccent.en),
      zh: field(fd, "heroAccent_zh", 120, d.heroAccent.zh),
      ja: field(fd, "heroAccent_ja", 120, d.heroAccent.ja),
    },
    intro: {
      en: field(fd, "intro_en", 400, d.intro.en),
      zh: field(fd, "intro_zh", 400, d.intro.zh),
      ja: field(fd, "intro_ja", 400, d.intro.ja),
    },
    footerNote: {
      en: field(fd, "footerNote_en", 200, d.footerNote.en),
      zh: field(fd, "footerNote_zh", 200, d.footerNote.zh),
      ja: field(fd, "footerNote_ja", 200, d.footerNote.ja),
    },
  };

  await writeBranding(next);
  return { ok: true };
}

export async function resetBranding(): Promise<{ ok: boolean }> {
  await requireAdmin();
  await writeBranding(DEFAULT_BRANDING);
  return { ok: true };
}
