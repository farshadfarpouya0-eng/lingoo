"use client";
import { useEffect, useRef, useState } from "react";

type Presence = { other: { name: string; online: boolean; lastSeenAt: string | null; hidden?: boolean }; serverTime: string };
export default function ClassroomPresence({ lessonId, otherName }: { lessonId: number; otherName: string }) {
  const [state, setState] = useState<Presence["other"] | null>(null);
  const [rtt, setRtt] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      if (busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      const start = performance.now();
      try {
        const response = await fetch(`/api/lessons/${lessonId}/presence`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error("presence");
        const data = await response.json() as Presence;
        if (!mounted) return;
        setState(data.other);
        setRtt(Math.round(performance.now() - start));
        setError(false);
      } catch { if (mounted) setError(true); }
      finally { busy.current = false; }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 20_000);
    const onVisible = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { mounted = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [lessonId]);
  const latencyClass = rtt === null ? "text-slate-400" : rtt <= 150 ? "text-emerald-700" : rtt <= 300 ? "text-amber-700" : "text-red-600";
  return <div className="mt-4 rounded-xl bg-slate-50 p-3" aria-live="polite">
    <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${state?.online ? "bg-emerald-500" : "bg-slate-300"}`}/><span className="truncate text-xs font-semibold text-slate-700">{state?.name || otherName}</span></div><span className={`text-[11px] font-semibold ${state?.online ? "text-emerald-700" : "text-slate-500"}`}>{error ? "Status unavailable" : state?.hidden ? "Hidden by participant" : state?.online ? "Online" : state?.lastSeenAt ? `Last seen ${new Date(state.lastSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not active yet"}</span></div>
    <div className="mt-2 flex items-center justify-between gap-2 text-[11px]"><span className="text-slate-500">Lingorain connection latency</span><span className={`font-bold ${latencyClass}`}>{rtt === null ? "—" : `${rtt} ms`}</span></div>
    <p className="mt-1 text-[10px] leading-4 text-slate-400">Latency measures the request round trip to Lingorain, not the peer’s video/audio connection quality.</p>
  </div>;
}
