import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getT } from "@/lib/i18n";
import { ASSESS } from "@/lib/assessment-i18n";
import { GOALS } from "@/lib/placement-questions";
import PlacementTest from "@/components/PlacementTest";

export const dynamic = "force-dynamic";
export const metadata = { title: "English level test" };

export default async function WrittenTestPage({ searchParams }: {
  searchParams: Promise<{ audience?: string; goal?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "student") redirect("/dashboard");
  const sp = await searchParams;
  const { lang } = await getT();
  const a = ASSESS[lang];
  const goal = sp.goal && (GOALS as readonly string[]).includes(sp.goal) ? sp.goal : "";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-teal-700">{a.nav}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-teal-950">{a.testTitle}</h1>
      <div className="mt-6">
        <PlacementTest a={a} initialGoal={goal} initialAudience={sp.audience === "kids" ? "kids" : "adults"} />
      </div>
    </div>
  );
}
