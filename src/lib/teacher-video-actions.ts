"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teacherProfiles } from "@/db/schema";
import { getUser } from "./auth";
import { parsePrivateStorageRef, validateUploadedPrivateFile, TEACHER_VIDEO_FOLDER } from "./private-storage";

type VideoResult = { ok: boolean; error?: string };
export type VideoKind = "intro" | "sample";

const COLUMN: Record<VideoKind, "introVideoUrl" | "sampleVideoUrl"> = {
  intro: "introVideoUrl",
  sample: "sampleVideoUrl",
};

/**
 * Called after the browser has uploaded a video straight to private storage.
 * The stored object is re-validated on the server (ownership, extension and the
 * file's real signature) before it becomes the tutor's intro or sample video.
 */
export async function saveTeacherVideo(kind: VideoKind, reference: string): Promise<VideoResult> {
  const user = await getUser();
  if (!user || user.role !== "teacher") return { ok: false, error: "Teacher access required." };
  if (!COLUMN[kind]) return { ok: false, error: "Choose the video type." };
  if (!parsePrivateStorageRef(reference)) return { ok: false, error: "Invalid upload reference." };
  try {
    await validateUploadedPrivateFile(reference, TEACHER_VIDEO_FOLDER, user.id, "video");
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The video could not be verified." };
  }
  await db.update(teacherProfiles).set({ [COLUMN[kind]]: reference }).where(eq(teacherProfiles.userId, user.id));
  revalidatePath("/dashboard");
  revalidatePath("/assessment/results");
  return { ok: true };
}

/** Removes the tutor's intro or sample video from their profile (the stored object is also cleared). */
export async function clearTeacherVideo(kind: VideoKind): Promise<VideoResult> {
  const user = await getUser();
  if (!user || user.role !== "teacher") return { ok: false, error: "Teacher access required." };
  if (!COLUMN[kind]) return { ok: false, error: "Choose the video type." };
  await db.update(teacherProfiles).set({ [COLUMN[kind]]: "" }).where(eq(teacherProfiles.userId, user.id));
  revalidatePath("/dashboard");
  revalidatePath("/assessment/results");
  return { ok: true };
}
