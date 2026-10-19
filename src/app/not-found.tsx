import Link from "next/link";
import { getT } from "@/lib/i18n";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-md px-4 py-32 text-center">
      <div className="text-7xl font-black text-teal-700">404</div>
      <h1 className="mt-4 text-2xl font-black text-teal-950">{t.notFoundTitle}</h1>
      <Link href="/" className="mt-8 inline-block rounded-full bg-teal-700 px-6 py-3 font-bold text-white hover:bg-teal-800">{t.backHome}</Link>
    </div>
  );
}
