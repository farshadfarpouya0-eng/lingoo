import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getBranding } from "@/lib/branding";
import BrandingForm from "@/components/admin/BrandingForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Branding" };

export default async function AdminBranding() {
  const me = await getUser();
  if (!me || me.role !== "admin") redirect("/login");

  const branding = await getBranding();

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Admin · Appearance</p>
          <h1 className="mt-1 text-3xl font-black text-teal-950">Branding</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Logo, name and hero copy for all three languages. Changes appear on the site after you save.
          </p>
        </div>
        <Link href="/" target="_blank" className="text-sm font-semibold text-teal-700">Open site ↗</Link>
      </div>

      <BrandingForm branding={branding} />
    </>
  );
}
