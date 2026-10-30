import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { learningMaterials } from "@/db/schema";
import { getUser } from "@/lib/auth";
import LingoRoomDemo from "@/components/LingoRoomDemo";

export const dynamic = "force-dynamic";
export const metadata = { title: "LingoRoom Demo", robots: { index: false, follow: false } };

export default async function LingoRoomDemoPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (user.role !== "teacher") redirect("/dashboard");
  const books = await db.select({ id: learningMaterials.id, title: learningMaterials.title, category: learningMaterials.category, level: learningMaterials.level, description: learningMaterials.description, fileUrl: learningMaterials.fileUrl }).from(learningMaterials).where(eq(learningMaterials.published, true)).orderBy(asc(learningMaterials.title)).limit(200);
  return <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6"><LingoRoomDemo teacherName={user.name} books={books}/></main>;
}
