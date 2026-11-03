"use client";
import { useCallback, useEffect, useState } from "react";

type State = { enabled?: boolean; webhookConfigured?: boolean; isTeacher?: boolean; userConsented?: boolean; everyoneConsented?: boolean; requiredCount?: number; consentCount?: number; status?: string; expiresAt?: string | null; canStart?: boolean; canStop?: boolean; downloadUrl?: string; error?: string };
export default function RecordingConsentPanel({ lessonId, platform }: { lessonId: number; platform: string }) {
  const [state, setState] = useState<State>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/lessons/${lessonId}/recording`, { cache: "no-store" });
      const data = await r.json() as State;
      if (r.ok) setState(data);
      else setMessage(data.error || "Could not load recording status.");
    } catch { setMessage("Could not load recording status."); }
  }, [lessonId]);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000); return () => window.clearInterval(timer); }, [refresh]);
  async function act(action: "start" | "stop" | "consent", consented?: boolean) {
    setBusy(true); setMessage("");
    try {
      const r = await fetch(`/api/lessons/${lessonId}/recording`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, consented }) });
      const data = await r.json() as { error?: string };
      if (!r.ok) throw new Error(data.error || "The request failed.");
      await refresh();
      setMessage(action === "consent" ? (consented ? "Your consent has been saved." : "Your consent was withdrawn.") : action === "start" ? "Recording start requested." : "Recording stop requested.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "The request failed."); }
    finally { setBusy(false); }
  }
  if (platform !== "daily" || state.enabled === false) return null;
  return <section className="rounded-2xl border border-violet-200 bg-white p-5">
    <h2 className="font-bold text-violet-950">Class recording and consent</h2>
    <p className="mt-1 text-sm leading-6 text-slate-600">Recording is optional. It cannot start until every current participant has agreed. Consent can be withdrawn at any time; withdrawing consent requests that the recording stop.</p>
    {state.error && <p role="alert" className="mt-3 text-sm text-red-600">{state.error}</p>}
    {state.enabled && <>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">Status: {state.status || "checking"}</span><span className="rounded-full bg-violet-50 px-3 py-1.5 font-semibold text-violet-800">Consents: {state.consentCount || 0}/{state.requiredCount || 0}</span>{state.expiresAt && <span className="text-slate-400">Available until {new Date(state.expiresAt).toLocaleString()}</span>}</div>
      {state.status === "ready" && state.downloadUrl && <a className="mt-4 inline-flex rounded-xl bg-violet-800 px-4 py-2.5 text-sm font-bold text-white" href={state.downloadUrl}>Download recording</a>}
      {(state.status === "stop_pending" || state.status === "stop_retrying") && <p role="status" className="mt-3 text-xs font-semibold text-amber-800">Stop confirmation is pending with the video provider. The system will retry automatically.</p>}
      {state.status === "deleted" || state.status === "expired" ? <p className="mt-3 text-xs text-slate-500">This recording has expired and is no longer available.</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {!state.userConsented ? <button disabled={busy} onClick={() => void act("consent", true)} className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">I consent to recording</button> : <button disabled={busy || state.status === "ready" || state.status === "deleted"} onClick={() => void act("consent", false)} className="rounded-xl border border-violet-200 px-4 py-2.5 text-sm font-semibold text-violet-800 disabled:opacity-50">Withdraw consent</button>}
        {state.isTeacher && state.canStart && <button disabled={busy} onClick={() => void act("start")} className="rounded-xl bg-teal-800 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">Start recording</button>}
        {state.isTeacher && state.canStop && <button disabled={busy} onClick={() => void act("stop")} className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">Stop recording</button>}
      </div>
      {message && <p role="status" className="mt-3 text-xs text-slate-500">{message}</p>}
      {state.isTeacher && state.webhookConfigured === false && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Recording setup is incomplete. An administrator must register the Daily webhook in Admin → Integrations before recording can start.</p>}
      {state.isTeacher && !state.canStart && state.status === "none" && !state.everyoneConsented && <p className="mt-3 text-xs text-slate-500">Waiting for consent from each participant before recording can start.</p>}
    </>}
    {state.enabled === undefined && <p className="mt-3 text-xs text-slate-500">Loading recording status…</p>}
  </section>;
}
