"use server";
import { revalidatePath } from "next/cache";
import { getUser } from "./auth";
import { hit } from "./ratelimit";
import { purchaseLessonPackage } from "./package-service";
import { chooseClassroom, reportConnectionProblem } from "./room-service";
export type PurchaseResult = { error?: string; packageId?: number };
export async function buyPackage(_: PurchaseResult | null, fd: FormData): Promise<PurchaseResult> {
  const u = await getUser();
  if (!u || u.role !== "student") return { error: "forbidden" };
  if (!await hit(`package:${u.id}`, 30, 60 * 60_000)) return { error: "rate" };
  try {
    const pack = await purchaseLessonPackage(u.id, { teacherId: Number(fd.get("teacherId")), duration: Number(fd.get("duration")), count: Number(fd.get("count")), purchaseKey: String(fd.get("purchaseKey") || ""), expectedTotal: Number(fd.get("expectedTotal")) });
    revalidatePath("/dashboard");
    return { packageId: pack.id };
  } catch (e) { return { error: e instanceof Error && ["balance", "plan", "forbidden"].includes(e.message) ? e.message : "generic" }; }
}
export type RoomResult = { error?: string; ok?: boolean };
export async function saveClassroom(_: RoomResult | null, fd: FormData): Promise<RoomResult> {
  const u = await getUser();
  if (!u || u.role !== "teacher") return { error: "forbidden" };
  if (!await hit(`room:${u.id}`, 30, 60_000)) return { error: "rate" };
  const id = Number(fd.get("lessonId"));
  if (!Number.isInteger(id)) return { error: "forbidden" };
  try {
    await chooseClassroom(u.id, id, String(fd.get("platform") || ""), String(fd.get("meetingUrl") || "").slice(0, 1000));
    revalidatePath("/dashboard");
    revalidatePath(`/classroom/${id}`);
    return { ok: true };
  } catch (e) { return { error: e instanceof Error ? e.message : "generic" }; }
}
export async function requestClassroomSwitch(lessonId: number): Promise<RoomResult> {
  const u = await getUser();
  if (!u || u.role !== "student" || !Number.isInteger(lessonId)) return { error: "forbidden" };
  if (!await hit(`room-issue:${u.id}`, 3, 60_000)) return { error: "rate" };
  try { await reportConnectionProblem(u.id, lessonId); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "generic" }; }
}
