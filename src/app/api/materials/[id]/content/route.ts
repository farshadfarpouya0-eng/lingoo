import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { learningMaterials, materialPurchases } from "@/db/schema";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Heavy course content is fetched only when a learner opens a book, never in list payloads. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "bad_id" }, { status: 400 });

  const [m] = await db.select({
    id: learningMaterials.id,
    title: learningMaterials.title,
    kind: learningMaterials.kind,
    description: learningMaterials.description,
    fileUrl: learningMaterials.fileUrl,
    isFree: learningMaterials.isFree,
    published: learningMaterials.published,
  }).from(learningMaterials).where(eq(learningMaterials.id, id)).limit(1);

  if (!m || !m.published) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!m.isFree && user.role !== "teacher" && user.role !== "admin") {
    const [owned] = await db.select({ id: materialPurchases.id }).from(materialPurchases)
      .where(and(eq(materialPurchases.userId, user.id), eq(materialPurchases.materialId, id)))
      .limit(1);
    if (!owned) return NextResponse.json({ error: "purchase_required" }, { status: 403 });
  }

  return NextResponse.json({
    fileUrl: m.fileUrl,
    title: m.title,
    kind: m.kind,
    description: m.description,
  });
}
