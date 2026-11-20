/**
 * Resolves what a <video> element should load for a tutor video.
 * Uploaded videos are stored as storage:// references and are streamed through the
 * protected route; older demo entries are plain https links and are used as-is.
 */
export function teacherVideoSrc(teacherId: number, kind: "intro" | "sample", value: string | null | undefined): string {
  if (!value) return "";
  if (value.startsWith("storage://")) return `/api/teacher-videos/${teacherId}?kind=${kind}`;
  return value;
}
