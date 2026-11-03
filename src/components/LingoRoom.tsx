"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon, { type IconName } from "./Icon";
import ClassroomChat from "@/components/ClassroomChat";
import ClassroomTeachingWorkspace from "@/components/ClassroomTeachingWorkspace";

type Props = {
  joinUrl: string;
  roomName: string;
  displayName: string;
  onNameChange: (v: string) => void;
  startLabel: string;
  minutesLeft: number | null;
  isTutor: boolean;
  lessonId: number;
  books: { id: number; title: string; category: string; level: string; fileUrl: string; description: string | null }[];
  userId: number;
};

type JitsiEvent = { muted?: boolean; on?: boolean; id?: string; displayName?: string; participants?: unknown[] };
type JitsiApi = {
  executeCommand: (command: string, ...args: unknown[]) => void;
  addListener?: (event: string, callback: (payload?: JitsiEvent) => void) => void;
  addEventListener?: (event: string, callback: (payload?: JitsiEvent) => void) => void;
  dispose: () => void;
};
type JitsiConstructor = new (domain: string, options: Record<string, unknown>) => JitsiApi;
declare global { interface Window { JitsiMeetExternalAPI?: JitsiConstructor } }

let jitsiScriptPromise: Promise<JitsiConstructor> | undefined;
function loadJitsiApi(domain: string): Promise<JitsiConstructor> {
  const availableConstructor = typeof window !== "undefined" ? window.JitsiMeetExternalAPI : undefined;
  if (availableConstructor) return Promise.resolve(availableConstructor);
  if (jitsiScriptPromise) return jitsiScriptPromise;

  const pending = new Promise<JitsiConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-lingorain-jitsi="${domain}"]`);
    const script = existing || document.createElement("script");
    const cleanup = () => { jitsiScriptPromise = undefined; };
    script.addEventListener("load", () => {
      const constructor = window.JitsiMeetExternalAPI;
      if (constructor) resolve(constructor);
      else { cleanup(); reject(new Error("The video room controls could not be loaded.")); }
    }, { once: true });
    script.addEventListener("error", () => { cleanup(); reject(new Error("The video service could not be reached. Check your connection and try again.")); }, { once: true });
    if (!existing) {
      script.src = `https://${domain}/external_api.js`;
      script.async = true;
      script.dataset.lingorainJitsi = domain;
      document.head.appendChild(script);
    }
  });
  const tracked: Promise<JitsiConstructor> = pending.catch((error: unknown) => {
    jitsiScriptPromise = undefined;
    throw error;
  });
  jitsiScriptPromise = tracked;
  return tracked;
}

const tool = "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";
const tabs = [
  { id: "plan", label: "Lesson", icon: "book" },
  { id: "people", label: "People", icon: "user" },
  { id: "notes", label: "Notes", icon: "copy" },
  { id: "tools", label: "Studio tools", icon: "box" },
  { id: "chat", label: "Chat", icon: "messages" },
] as const;

type SideTab = typeof tabs[number]["id"];

export default function LingoRoom({ joinUrl, roomName, displayName, onNameChange, startLabel, minutesLeft, isTutor, lessonId, books, userId }: Props) {
  const [joined, setJoined] = useState(false);
  const [tab, setTab] = useState<SideTab>("plan");
  const [notes, setNotes] = useState("");
  const [apiReady, setApiReady] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [participants, setParticipants] = useState<{ id: string; displayName: string }[]>([]);
  const participantCount = 1 + participants.length;
  const [studioView, setStudioView] = useState<"video" | "board">("video");
  const boxRef = useRef<HTMLDivElement | null>(null);
  const videoMountRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiApi | null>(null);

  const parsedRoom = (() => {
    try {
      const u = new URL(joinUrl);
      return { domain: u.hostname, room: u.pathname.replace(/^\/+|\/+$/g, "") };
    } catch { return null; }
  })();

  useEffect(() => {
    if (!joined || !parsedRoom || !videoMountRef.current) return;
    let cancelled = false;
    let instance: JitsiApi | null = null;
    setConnectionError("");
    setApiReady(false);
    void loadJitsiApi(parsedRoom.domain).then(JitsiMeetExternalAPI => {
      if (cancelled || !videoMountRef.current) return;
      instance = new JitsiMeetExternalAPI(parsedRoom.domain, {
        roomName: parsedRoom.room,
        parentNode: videoMountRef.current,
        width: "100%",
        height: "100%",
        userInfo: { displayName: displayName.trim() || (isTutor ? "Tutor" : "Student") },
        configOverwrite: {
          prejoinPageEnabled: false,
          disableDeepLinking: true,
          enableWelcomePage: false,
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          disableInviteFunctions: true,
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: [],
          SHOW_JITSI_WATERMARK: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
          DEFAULT_BACKGROUND: "#0b1720",
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
          MOBILE_APP_PROMO: false,
        },
      });
      apiRef.current = instance;
      const listen = (event: string, callback: (payload?: JitsiEvent) => void) => {
        if (instance?.addListener) instance.addListener(event, callback);
        else instance?.addEventListener?.(event, callback);
      };
      listen("videoConferenceJoined", () => { if (!cancelled) { setApiReady(true); setConnectionError(""); } });
      listen("videoConferenceLeft", () => { if (!cancelled) setApiReady(false); });
      listen("audioMuteStatusChanged", event => { if (!cancelled && typeof event?.muted === "boolean") setMuted(event.muted); });
      listen("videoMuteStatusChanged", event => { if (!cancelled && typeof event?.muted === "boolean") setCameraOff(event.muted); });
      listen("screenSharingStatusChanged", event => { if (!cancelled && typeof event?.on === "boolean") setSharing(event.on); });
      listen("participantJoined", event => {
        if (!cancelled && event?.id) setParticipants(current => current.some(person => person.id === event.id)
          ? current
          : [...current, { id: event.id!, displayName: event.displayName?.trim() || "Participant" }]);
      });
      listen("participantLeft", event => {
        if (!cancelled && event?.id) setParticipants(current => current.filter(person => person.id !== event.id));
      });
      listen("readyToClose", () => { if (!cancelled) setJoined(false); });
      // The API may join before the event listener has completed on slower hosts.
      window.setTimeout(() => { if (!cancelled && apiRef.current) setApiReady(true); }, 2200);
    }).catch(error => {
      if (!cancelled) setConnectionError(error instanceof Error ? error.message : "Could not connect to the classroom.");
    });
    return () => {
      cancelled = true;
      if (apiRef.current === instance) apiRef.current = null;
      instance?.dispose();
      setApiReady(false);
    };
  }, [joined, joinUrl, parsedRoom?.domain, parsedRoom?.room, displayName, isTutor]);

  const runCommand = useCallback((command: string, success?: string) => {
    try {
      if (!apiRef.current) throw new Error("The classroom is still connecting. Try again in a moment.");
      apiRef.current.executeCommand(command);
      if (success) setActionMessage(success);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "This classroom control is not available right now.");
    }
  }, []);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = window.setTimeout(() => setActionMessage(""), 3600);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const toggleFullscreen = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => setActionMessage("Fullscreen is not available in this browser."));
  }, []);

  const leaveRoom = useCallback(() => {
    try { apiRef.current?.executeCommand("hangup"); } catch { /* disposal below still closes the local room */ }
    setJoined(false);
    setApiReady(false);
    setSharing(false);
    setParticipants([]);
  }, []);

  if (!joined) {
    return (
      <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_70px_-36px_rgba(8,47,53,.45)]">
        <header className="relative overflow-hidden bg-[#0b2029] px-6 py-6 text-white sm:px-8">
          <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-teal-400/15 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-white/10 text-teal-200"><span className="text-xl font-black">L</span></span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-teal-200">LINGORAIN · LEARNING STUDIO</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight">Your classroom, your space.</h2>
              </div>
            </div>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-teal-50">Private session · {roomName}</span>
          </div>
          <p className="relative mt-5 max-w-2xl text-sm leading-6 text-slate-300">A focused space for live teaching, shared learning materials, screen presentations and interactive practice.</p>
        </header>
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.15fr_.85fr]">
          <div className="relative flex min-h-[270px] flex-col justify-between overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0c2932] via-[#123d43] to-[#0e655e] p-6 text-white">
            <div className="absolute -bottom-20 -right-12 h-64 w-64 rounded-full border-[28px] border-white/5" />
            <div className="relative flex items-center justify-between">
              <span className="rounded-full bg-emerald-300/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-100">Studio ready</span>
              <span className="text-xs text-white/60">Session #{lessonId}</span>
            </div>
            <div className="relative">
              <div className="flex items-center gap-3">
                <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/15 bg-white/10"><Icon name="video" width={27} height={27} /></span>
                <div><p className="text-lg font-extrabold">A better way to learn together</p><p className="mt-1 text-xs text-white/65">Video · Screen share · Whiteboard · Materials</p></div>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-2">
                {([
                  { icon: "video", label: "HD video" },
                  { icon: "box", label: "Shared tools" },
                  { icon: "messages", label: "Live chat" },
                ] satisfies ReadonlyArray<{ icon: IconName; label: string }>).map(({ icon, label }) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-black/10 px-3 py-3">
                    <Icon name={icon} width={17} height={17} />
                    <p className="mt-2 text-[10px] font-semibold text-white/75">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-teal-700">Before you enter</p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">Set up your seat</h3>
            <label className="mt-5 block text-xs font-bold text-slate-600">Display name
              <input value={displayName} onChange={e => onNameChange(e.target.value)} maxLength={40} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10" placeholder="Your name" />
            </label>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3"><span className="text-slate-500">Camera & microphone</span><span className="font-semibold text-slate-700">Browser will ask on entry</span></div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3"><span className="text-slate-500">Lesson starts</span><span className="font-semibold text-slate-800">{startLabel}</span></div>
            </div>
            <button type="button" onClick={() => { setConnectionError(""); setJoined(true); }} className="mt-5 inline-flex items-center justify-center gap-3 rounded-xl bg-teal-800 px-6 py-4 text-sm font-bold text-white shadow-lg shadow-teal-900/15 transition hover:-translate-y-0.5 hover:bg-teal-900">
              Enter LingoRoom <Icon name="arrow" width={18} height={18} />
            </button>
            <p className="mt-3 text-[11px] leading-5 text-slate-400">Recording is off by default. Any recording must be enabled through the classroom’s consent flow.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={boxRef} className="overflow-hidden rounded-[28px] border border-[#183b43] bg-[#091922] shadow-[0_28px_80px_-35px_rgba(7,42,48,.7)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0d222c] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-teal-300 to-emerald-500 text-[#073239]"><span className="text-lg font-black">L</span></span>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="text-sm tracking-wide text-white">LINGORAIN STUDIO</b><span className="rounded-full bg-rose-500/15 px-2 py-1 text-[9px] font-extrabold tracking-widest text-rose-200"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />LIVE</span></div><p className="mt-0.5 truncate text-[10px] text-slate-400">{roomName} · {participantCount} in room</p></div>
        </div>
        <div className="flex items-center gap-2">
          {minutesLeft !== null && <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-slate-200 sm:inline-flex">{minutesLeft > 0 ? `${minutesLeft} min left` : "Overtime"}</span>}
          {sharing && <span className="rounded-full bg-amber-300/15 px-3 py-2 text-[10px] font-bold text-amber-100">Screen sharing</span>}
          <span className={`rounded-full px-3 py-2 text-[10px] font-bold ${apiReady ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-300/10 text-amber-100"}`}>{apiReady ? "Connected" : "Connecting…"}</span>
          <button type="button" onClick={toggleFullscreen} className={`${tool} bg-white/10 text-white hover:bg-white/15`}><Icon name="swap" width={15} height={15} /> Fullscreen</button>
          <button type="button" onClick={leaveRoom} className={`${tool} bg-rose-500/15 text-rose-100 hover:bg-rose-500/25`}><Icon name="close" width={15} height={15} /> Leave</button>
        </div>
      </header>

      {connectionError && <div role="alert" className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-xs text-rose-100"><span>{connectionError}</span><button type="button" onClick={() => { setJoined(false); window.setTimeout(() => setJoined(true), 80); }} className="rounded-lg bg-white/10 px-3 py-2 font-bold">Reconnect</button></div>}
      {actionMessage && <div role="status" className="mx-4 mt-3 rounded-xl border border-teal-300/20 bg-teal-300/10 px-4 py-2.5 text-xs text-teal-50">{actionMessage}</div>}

      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_310px]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-400"/><p className="text-xs font-bold text-slate-100">{studioView === "video" ? "Live video room" : "Collaborative whiteboard"}</p></div>
            <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
              <button type="button" onClick={() => setStudioView("video")} className={`rounded-lg px-3 py-2 text-[11px] font-bold ${studioView === "video" ? "bg-teal-300 text-[#082b31]" : "text-slate-300 hover:bg-white/10"}`}>Video room</button>
              <button type="button" onClick={() => { setStudioView("board"); setTab("tools"); }} className={`rounded-lg px-3 py-2 text-[11px] font-bold ${studioView === "board" ? "bg-teal-300 text-[#082b31]" : "text-slate-300 hover:bg-white/10"}`}>Whiteboard</button>
            </div>
          </div>

          {studioView === "video" ? (
            <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-black">
              <div ref={videoMountRef} className="h-[64vh] min-h-[400px] w-full bg-[#07131b]" />
              {!apiReady && !connectionError && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#07131b]/70"><div className="text-center text-white"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-teal-300/10 text-teal-200"><Icon name="video" width={24} height={24}/></span><p className="mt-3 text-sm font-bold">Preparing your live classroom</p><p className="mt-1 text-xs text-white/55">Connecting video, audio and studio controls…</p></div></div>}
            </div>
          ) : (
            <div className="overflow-hidden rounded-[22px] border border-white/10 bg-white">
              <ClassroomTeachingWorkspace key={`board-${lessonId}`} lessonId={lessonId} books={books} isTutor={isTutor} userId={userId} initialTab="board" />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2 rounded-[20px] border border-white/10 bg-[#102832] p-3">
            <button type="button" disabled={!apiReady} onClick={() => runCommand("toggleAudio", muted ? "Microphone enabled" : "Microphone muted")} className={`${tool} min-w-[86px] ${muted ? "bg-rose-500 text-white" : "bg-white/10 text-white hover:bg-white/15"}`}><Icon name="messages" width={16} height={16}/>{muted ? "Unmute" : "Mute"}</button>
            <button type="button" disabled={!apiReady} onClick={() => runCommand("toggleVideo", cameraOff ? "Camera enabled" : "Camera off")} className={`${tool} min-w-[86px] ${cameraOff ? "bg-rose-500 text-white" : "bg-white/10 text-white hover:bg-white/15"}`}><Icon name="video" width={16} height={16}/>{cameraOff ? "Camera on" : "Camera off"}</button>
            <button type="button" disabled={!apiReady} onClick={() => runCommand("toggleShareScreen", sharing ? "Screen sharing stopped" : "Choose a screen or window to share")} className={`${tool} min-w-[112px] ${sharing ? "bg-amber-300 text-slate-950" : "bg-teal-300 text-[#082b31] hover:bg-teal-200"}`}><Icon name="copy" width={16} height={16}/>{sharing ? "Stop sharing" : "Share screen"}</button>
            <button type="button" disabled={!apiReady} onClick={() => { runCommand("toggleRaiseHand", handRaised ? "Hand lowered" : "Hand raised"); setHandRaised(value => !value); }} className={`${tool} bg-white/10 text-white hover:bg-white/15`}><Icon name="user" width={16} height={16}/>{handRaised ? "Lower hand" : "Raise hand"}</button>
            <button type="button" disabled={!apiReady} onClick={() => runCommand("toggleSubtitles", "Live captions toggled")} className={`${tool} bg-white/10 text-white hover:bg-white/15`}><Icon name="book" width={16} height={16}/>Captions</button>
            <button type="button" disabled={!apiReady} onClick={() => runCommand("toggleTileView", "Video layout changed")} className={`${tool} bg-white/10 text-white hover:bg-white/15`}><Icon name="chart" width={16} height={16}/>Layout</button>
            <button type="button" onClick={() => { setStudioView("board"); setTab("tools"); }} className={`${tool} bg-white/10 text-white hover:bg-white/15`}><Icon name="box" width={16} height={16}/>Open board</button>
          </div>
          <p className="px-1 text-[10px] leading-5 text-slate-500">Screen sharing uses your browser’s permission prompt. Only the screen or window you select is shared with the other participant.</p>
        </div>

        <aside className="flex min-h-[520px] flex-col overflow-hidden rounded-[22px] border border-white/10 bg-[#f9fbfa]">
          <div className="border-b border-slate-200 bg-white px-4 py-4"><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-teal-700">Your learning space</p><h3 className="mt-1 text-lg font-black tracking-tight text-slate-900">Session workspace</h3><p className="mt-1 text-[11px] text-slate-500">Plan, people, notes and shared tools.</p></div>
          <nav className="grid grid-cols-5 border-b border-slate-200 bg-white px-2">
            {tabs.map(item => <button key={item.id} type="button" onClick={() => { setTab(item.id); if (item.id === "tools") setStudioView("video"); }} aria-pressed={tab === item.id} className={`flex flex-col items-center gap-1 border-b-2 px-1 py-3 text-[9px] font-bold transition ${tab === item.id ? "border-teal-700 text-teal-800" : "border-transparent text-slate-400 hover:text-slate-700"}`}><Icon name={item.icon} width={16} height={16}/>{item.label}</button>)}
          </nav>
          <div className="flex-1 overflow-auto p-4">
            {tab === "plan" && <div className="space-y-3">{[
              ["01", "Warm up", "Start with a short conversation and review."],
              ["02", "Today's focus", "Introduce the target vocabulary and grammar."],
              ["03", "Guided practice", "Practice together and make live corrections."],
              ["04", "Speak freely", "Use the new language in a real conversation."],
              ["05", "Wrap up", "Review progress and agree on next steps."],
            ].map(([n, title, description]) => <div key={n} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-teal-50 text-[10px] font-black text-teal-800">{n}</span><div><p className="text-xs font-bold text-slate-800">{title}</p><p className="mt-1 text-[10px] leading-5 text-slate-500">{description}</p></div></div>)}</div>}
            {tab === "people" && <div className="space-y-3"><div className="rounded-xl bg-teal-50 p-3"><p className="text-xs font-bold text-teal-900">In this session</p><p className="mt-1 text-[11px] text-teal-800">{participantCount} participant{participantCount === 1 ? "" : "s"} connected to this room.</p></div>{[
              { id: "self", name: displayName || (isTutor ? "Tutor" : "Student"), role: isTutor ? "Tutor · You" : "Student · You", self: true },
              ...participants.map(person => ({ id: person.id, name: person.displayName, role: isTutor ? "Student" : "Tutor", self: false })),
            ].map(person => <div key={person.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-teal-100 to-emerald-100 text-xs font-black text-teal-800">{person.name.slice(0,1).toUpperCase()}</span><div><p className="text-xs font-bold text-slate-800">{person.name}</p><p className="text-[10px] text-slate-400">{person.role}</p></div>{person.self && <span className="ml-auto rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">You</span>}</div>)}</div>}
            {tab === "notes" && <div><div className="rounded-xl bg-amber-50 p-3"><p className="text-xs font-bold text-amber-900">Private session notes</p><p className="mt-1 text-[10px] leading-5 text-amber-800">Only visible in this browser session. Write down new words, corrections or reminders.</p></div><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={14} placeholder="New vocabulary…\nPronunciation notes…\nNext lesson goals…" className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-700 outline-none focus:border-teal-500" /></div>}
            {tab === "tools" && (studioView === "board" ? <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4"><p className="text-xs font-bold text-teal-950">Whiteboard is open</p><p className="mt-2 text-[11px] leading-5 text-teal-900">Use the large shared board beside this panel. Both you and the other participant can draw; the teacher controls Undo and Clear.</p><button type="button" onClick={() => setStudioView("video")} className="mt-3 rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white">Back to video</button></div> : <ClassroomTeachingWorkspace lessonId={lessonId} books={books} isTutor={isTutor} userId={userId} />)}
            {tab === "chat" && <ClassroomChat lessonId={lessonId} userId={userId} />}
          </div>
          <footer className="border-t border-slate-200 bg-white px-4 py-3"><p className="text-[10px] leading-5 text-slate-400">Lingorain Studio · A private learning space for this lesson.</p></footer>
        </aside>
      </div>
    </section>
  );
}
