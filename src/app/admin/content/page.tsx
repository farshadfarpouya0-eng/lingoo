import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { getContentFor, getSettingsFor } from "@/lib/site-content";
import AdminShell from "@/components/AdminShell";
import ContentEditor from "./ContentEditor";

export const dynamic = "force-dynamic";
export default async function AdminContent({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const user = await getUser();
  if (!user || user.role !== "admin") redirect("/login");
  const { t } = await getT();
  const { lang: defaultLang } = await getT();
  const { lang: qLang } = await searchParams;
  const lang = qLang === "zh" || qLang === "ja" || qLang === "en" ? qLang : defaultLang;
  const content = await getContentFor(lang);
  const settings = await getSettingsFor(lang);
  void defaultLang;
  return (
    <AdminShell>
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Content</p>
        <h1 className="mt-1 text-3xl font-black text-teal-950">{t.admin} · Content</h1>
        <p className="mt-2 text-sm text-slate-500">Edit homepage text and images per language. Changes publish instantly to the public site.</p>
      </div>
      <ContentEditor initialContent={content} initialSettings={settings} />
    </AdminShell>
  );
}
