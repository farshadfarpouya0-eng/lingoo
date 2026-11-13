"use client";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { studentTimeZone } from "@/lib/student-schedule";

/** Account preference wins. Only signed-out visitors fall back to their device zone. */
export function useStudentTime(profileZone: string | null | undefined, lang: Lang, serverNowMs: number) {
  const [deviceZone, setDeviceZone] = useState<string>();
  const [now, setNow] = useState(serverNowMs);
  const anchor = useRef({ server: serverNowMs, client: 0 });
  useEffect(() => {
    try { setDeviceZone(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { /* locale fallback */ }
  }, []);
  useEffect(() => {
    anchor.current = { server: serverNowMs, client: performance.now() };
    setNow(serverNowMs);
    const tick = () => setNow(anchor.current.server + performance.now() - anchor.current.client);
    const timer = window.setInterval(tick, 5000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [serverNowMs]);
  return { zone: studentTimeZone(profileZone, lang, deviceZone), now };
}
