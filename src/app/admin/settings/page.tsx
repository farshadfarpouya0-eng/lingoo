import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { getSiteContent } from "@/lib/site-content";
import AdminShell from "@/components/AdminShell";
import ContentEditor from "../content/ContentEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function AdminSettings() {
  const user = await getUser();
  if (!user || user.role !== "admin") redirect("/login");
  const { t } = await getT();
  const { content, settings } = await getSiteContent();
  return (
    <AdminShell>
      <div className="mb-5">
        <h1 className="text-3xl font-black text-teal-950">Site settings</h1>
        <p className="mt-1 text-sm text-slate-500">Edit site content, images, and settings. Changes publish instantly.</p>
      </div>
      <ContentEditor initialContent={content.en} initialSettings={settings} />
    </AdminShell>
  );
}
