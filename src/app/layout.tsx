import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import "./globals.css";
import { getT, LANGS } from "@/lib/i18n";
import { LANDING } from "@/lib/landing-i18n";
import { getUser } from "@/lib/auth";
import { logout, setLang } from "@/lib/actions";
import { getBranding } from "@/lib/branding";
import { exitImpersonation } from "@/lib/impersonation-actions";
import MobileMenu from "@/components/MobileMenu";
import BrandMark from "@/components/BrandMark";

export const metadata: Metadata = {
  title: { default: "Lingorain — English for adults & kids", template: "%s · Lingorain" },
  description:
    "Find a one-to-one English tutor for adults and kids. Lessons for Chinese and Japanese learners, conversation, exam prep and business English.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#143e37",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { t, lang } = await getT();
  const c = LANDING[lang];
  const branding = await getBranding();
  const user = await getUser().catch(() => null);
  const impersonating = Boolean(user) && (await cookies()).has("admin_sid");
  const safeUser = user ? { name: user.name, avatar: user.avatar, role: user.role } : null;
  const brandName = branding.brandName || t.brand;

  return (
    <html lang={lang === "zh" ? "zh-CN" : lang}>
      <body className="antialiased">
        <a href="#site-main" className="skip-link">Skip to content</a>

        {impersonating && user && (
          <div className="sticky top-0 z-50 bg-amber-400 text-teal-950">
            <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-6 py-2 text-xs font-semibold">
              <span>Viewing the site as <b>{user.name}</b> ({user.role})</span>
              <form action={exitImpersonation}>
                <button className="rounded-full bg-teal-950 px-4 py-1.5 font-bold text-white hover:bg-teal-900">← Back to admin</button>
              </form>
            </div>
          </div>
        )}

        <header className="site-header">
          <div className="site-header-inner">
            <Link href="/" aria-label={brandName} className="site-brand">
              <BrandMark src={branding.logoUrl} alt={brandName} />
              <span>{brandName}</span>
            </Link>

            <nav className="site-desktop-nav" aria-label={c.navigation}>
              <Link href="/teachers?audience=adults">{c.adultNav}</Link>
              <Link href="/teachers?audience=kids&tag=Kids">{c.kidsNav}</Link>
              <Link href="/teachers">{c.allTutors}</Link>
              {user && (
                <Link href={user.role === "admin" ? "/admin" : "/dashboard"}>
                  {user.role === "admin" ? t.admin : t.dashboard}
                </Link>
              )}
            </nav>

            <div className="site-header-actions">
              <form action={setLang} className="desktop-language" aria-label={c.language}>
                {LANGS.map(l => (
                  <button key={l.code} name="lang" value={l.code} aria-pressed={lang === l.code}>{l.label}</button>
                ))}
              </form>

              <div className="desktop-auth">
                {user ? (
                  <>
                    <Link href="/dashboard" aria-label={t.dashboard}>
                      <img src={user.avatar || ""} alt="" width={34} height={34} className="header-avatar" />
                    </Link>
                    <form action={logout}><button>{t.logout}</button></form>
                  </>
                ) : (
                  <>
                    <Link href="/login">{t.login}</Link>
                    <Link href="/register" className="header-signup">{t.register}</Link>
                  </>
                )}
              </div>

              <div className="mobile-header-auth">
                {user ? (
                  <Link href="/dashboard" aria-label={t.dashboard}>
                    <img src={user.avatar || ""} alt="" width={32} height={32} className="header-avatar" />
                  </Link>
                ) : (
                  <Link href="/login">{t.login}</Link>
                )}
              </div>

              <MobileMenu lang={lang} c={c} t={t} user={safeUser} />
            </div>
          </div>
        </header>

        <main id="site-main">{children}</main>

        <footer className="site-footer">
          <div className="footer-inner">
            <div className="footer-brand">
              <Link href="/" className="site-brand">
                <BrandMark size={36} src={branding.logoUrl} alt={brandName} />
                <span>{brandName}</span>
              </Link>
              <p>{branding.footerNote[lang] || c.personal}</p>
              <p className="footer-languages">English · 中文 · 日本語</p>
            </div>

            <div className="footer-column">
              <h2>{t.col_tutors}</h2>
              <ul>
                <li><Link href="/teachers?audience=adults">{c.adultNav}</Link></li>
                <li><Link href="/teachers?audience=kids&tag=Kids">{c.kidsNav}</Link></li>
                <li><Link href="/teachers">{t.findTeachers}</Link></li>
                <li><Link href="/login">{t.login}</Link></li>
              </ul>
            </div>

            <div className="footer-column">
              <h2>{t.col_company}</h2>
              <ul>
                <li><Link href="/register?role=teacher">{t.becomeTutor}</Link></li>
                <li><Link href="/#how-it-works">{c.howNav}</Link></li>
                <li><Link href="/#faq">{t.help}</Link></li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} {brandName}</span>
            <span>{t.footer}</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
