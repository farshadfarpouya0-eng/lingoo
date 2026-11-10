import { eq } from "drizzle-orm";
import { db } from "@/db";
import { teacherProfiles } from "@/db/schema";
import { assignedTeacherLinks } from "./room-service";
import { validMeetingLink, validZoomHostUrl } from "./meeting-links";
import { decryptIntegrationSecret, getIntegrationConfig } from "./integration-config";
import { fetchZoomHostStartUrl, zoomConfigured, zoomMeetingIdFromUrl } from "./zoom-api";

export type TeacherLaunch = { url: string; mode: "meet-guest" | "zoom-host" | "zoom-fallback"; notice?: string };

/** Teacher-only launch. Never call this for students; host/start URLs are bearer secrets. */
export async function resolveTeacherLaunch(teacherId: number, platform: "meet" | "zoom", lessonMeetingUrl: string): Promise<TeacherLaunch> {
  const links = await assignedTeacherLinks(teacherId);
  const [profile] = await db.select({ meetOpenAccess: teacherProfiles.meetOpenAccess, zoomHostUrl: teacherProfiles.zoomHostUrl })
    .from(teacherProfiles).where(eq(teacherProfiles.userId, teacherId)).limit(1);

  if (platform === "meet") {
    const url = validMeetingLink("meet", lessonMeetingUrl) || links.meet;
    if (!url) throw new Error("meet_setup");
    if (!profile?.meetOpenAccess) throw new Error("meet_open_access");
    return { url, mode: "meet-guest" };
  }

  const roomUrl = validMeetingLink("zoom", lessonMeetingUrl) || links.zoom;
  if (!roomUrl) throw new Error("zoom_setup");
  const cfg = await getIntegrationConfig();
  if (zoomConfigured(cfg.zoom)) {
    const meetingId = zoomMeetingIdFromUrl(roomUrl);
    if (meetingId) {
      try {
        const url = await fetchZoomHostStartUrl(cfg.zoom, meetingId);
        return { url, mode: "zoom-host" };
      } catch {
        // Fall back to an admin-saved host link only if one exists; otherwise surface setup error.
      }
    }
  }
  if (profile?.zoomHostUrl) {
    let raw = profile.zoomHostUrl;
    if (raw.startsWith("v1:")) raw = decryptIntegrationSecret(raw);
    const url = validZoomHostUrl(raw);
    if (url) return { url, mode: "zoom-fallback", notice: "Using the saved Zoom host link. If Zoom asks for login, connect the Zoom API or refresh this host link." };
  }
  throw new Error("zoom_setup");
}
