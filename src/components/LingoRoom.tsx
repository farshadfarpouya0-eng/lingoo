"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon, { type IconName } from "./Icon";
import type { ClassroomMaterial } from "@/lib/classroom-material";
import type { VideoProvider, VideoTicket } from "@/lib/video-provider";
import { videoApiUrl } from "@/lib/video-api-url";
import ClassroomChat from "@/components/ClassroomChat";
import ClassroomTeachingWorkspace from "@/components/ClassroomTeachingWorkspace";

type Props = {
  roomName: string;
  displayName: string;
  videoProvider: VideoProvider;
  videoMessage: string;
  startLabel: string;
  minutesLeft: number | null;
  isTutor: boolean;
  isAdmin: boolean;
  lessonId: number;
  books: ClassroomMaterial[];
  userId: number;
  autoJoin?: boolean;
};
type JitsiEvent = {
  muted?: boolean; on?: boolean; id?: string; displayName?: string; handRaised?: number;
  supported?: boolean; isFatal?: boolean; type?: string; name?: string; message?: string; details?: unknown;
};

function describeJitsiError(event?: JitsiEvent): string {
  if (!event) return "Unknown Jitsi error";
  const detailText = typeof event.details === "string"
    ? event.details
    : event.details && typeof event.details === "object"
      ? Object.values(event.details as Record<string, unknown>).filter(value => typeof value === "string").join(" · ")
      : "";
  return [event.type, event.name, event.message, detailText].filter(Boolean).join(" · ").slice(0, 300) || "Unknown Jitsi error";
}
type JitsiApi = {
  executeCommand: (command: string, ...args: unknown[]) => void;
  addListener: (event: string, callback: (payload?: JitsiEvent) => void) => void;
  getIFrame: () => HTMLIFrameElement | undefined;
  dispose: () => void;
};
type JitsiConstructor = new (domain: string, options: Record<string, unknown>) => JitsiApi;
declare global { interface Window { JitsiMeetExternalAPI?: JitsiConstructor } }

const jitsiApis = new Map<string, Promise<JitsiConstructor>>();
function loadJitsiApi(domain: string, roomName: string): Promise<JitsiConstructor> {
  const source = videoApiUrl(domain, roomName);
  const cached = jitsiApis.get(source);
  if (cached) return cached;
  const pending = new Promise<JitsiConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => { script.remove(); reject(new Error("The video service took too long to load. Check your connection and retry.")); }, 15_000);
    script.addEventListener("load", () => {
      window.clearTimeout(timer);
      const api = window.JitsiMeetExternalAPI;
      if (api) resolve(api);
      else { script.remove(); reject(new Error("This server did not provide the Jitsi external API. Check the video integration.")); }
    }, { once: true });
    script.addEventListener("error", () => {
      window.clearTimeout(timer); script.remove();
      reject(new Error("The video service could not be reached. Check its hostname, HTTPS certificate and CSP settings."));
    }, { once: true });
    script.src = source;
    script.async = true;
    script.dataset.lingorainJitsi = domain;
    document.head.appendChild(script);
  }).catch((error: unknown) => { jitsiApis.delete(source); throw error; });
  jitsiApis.set(source, pending);
  return pending;
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

export default function LingoRoom({ roomName, displayName, videoProvider, videoMessage, startLabel, minutesLeft, isTutor, isAdmin, lessonId, books, userId, autoJoin = false }: Props) {
  const [joined, setJoined] = useState(false);
  const autoJoinConsumed = useRef(false);
  useEffect(() => {
    if (autoJoin && !autoJoinConsumed.current && videoProvider !== "unconfigured") {
      autoJoinConsumed.current = true;
      setJoined(true);
    }
  }, [autoJoin, videoProvider]);
  const [tab, setTab] = useState<SideTab>("plan");
  const [notes, setNotes] = useState("");
  const [ticket, setTicket] = useState<VideoTicket | null>(null);
  const [ticketError, setTicketError] = useState("");
  const [apiReady, setApiReady] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [retry, setRetry] = useState(0);
  const [participants, setParticipants] = useState<{ id: string; displayName: string }[]>([]);
  const [studioView, setStudioView] = useState<"video" | "board">("video");
  const boxRef = useRef<HTMLElement | null>(null);
  const videoMountRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const localParticipantId = useRef("");
  const participantCount = apiReady ? 1 + participants.length : 0;

  // A token is never embedded in server HTML, a meeting URL, localStorage or analytics.
  // Membership and the server-verified teacher role are checked by this POST endpoint.
  useEffect(() => {
    if (!joined || videoProvider === "unconfigured") return;
    const controller = new AbortController();
    let cancelled = false;
    const timer = window.setTimeout(() => controller.abort(), 15_000);
    setTicketError("");
    setConnectionError("");
    fetch(`/api/lessons/${lessonId}/video-token`, { method: "POST", cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async response => {
        const data = await response.json() as Partial<VideoTicket> & { error?: string };
        if (!response.ok || !data.jwt || !data.domain || !data.roomName) throw new Error(data.error || "Could not authorize your classroom seat. Please retry.");
        if (!cancelled) setTicket(data as VideoTicket);
      })
      .catch((error: unknown) => {
        if (!cancelled) setTicketError(error instanceof Error && error.name !== "AbortError" ? error.message : "Authorization timed out. Please retry.");
      })
      .finally(() => window.clearTimeout(timer));
    return () => { cancelled = true; window.clearTimeout(timer); controller.abort(); };
  }, [joined, lessonId, videoProvider, retry]);

  useEffect(() => {
    if (!joined || !ticket || !videoMountRef.current) return;
    let cancelled = false;
    let failed = false;
    let instance: JitsiApi | null = null;
    let joinTimeout = 0;
    setApiReady(false);
    setConnectionError("");
    setParticipants([]);
    setHandRaised(false);
    setSharing(false);
    const fail = (message: string) => {
      if (cancelled || failed) return;
      failed = true;
      window.clearTimeout(joinTimeout);
      setApiReady(false);
      setConnectionError(message);
      if (apiRef.current === instance) apiRef.current = null;
      try { instance?.dispose(); } catch { /* iframe may already be gone */ }
      instance = null;
    };
    const blockedByPolicy = (event: SecurityPolicyViolationEvent) => {
      if (event.blockedURI.startsWith(`https://${ticket.domain}/`) && ["script-src", "script-src-elem", "frame-src"].includes(event.effectiveDirective)) {
        fail("The browser blocked the classroom domain. Reload this page after the administrator saves the video hostname; contact support if it remains blocked.");
      }
    };
    document.addEventListener("securitypolicyviolation", blockedByPolicy);
    void loadJitsiApi(ticket.domain, ticket.roomName).then(JitsiMeetExternalAPI => {
      if (cancelled || !videoMountRef.current) return;
      instance = new JitsiMeetExternalAPI(ticket.domain, {
        roomName: ticket.roomName,
        jwt: ticket.jwt,
        parentNode: videoMountRef.current,
        width: "100%", height: "100%",
        userInfo: { displayName: ticket.displayName },
        configOverwrite: {
          prejoinPageEnabled: false, requireDisplayName: false,
          disableDeepLinking: true, enableWelcomePage: false, enableClosePage: false,
          disableProfile: true, disableInviteFunctions: true, disableThirdPartyRequests: true,
          startWithAudioMuted: false, startWithVideoMuted: false,
          toolbarButtons: [], hideConferenceSubject: true, hideConferenceTimer: true,
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: [], SHOW_JITSI_WATERMARK: false, SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false, DEFAULT_BACKGROUND: "#0b1720",
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: true, MOBILE_APP_PROMO: false,
        },
      });
      apiRef.current = instance;
      const frame = instance.getIFrame?.();
      if (frame) {
        frame.title = "Lingorain live classroom";
        frame.referrerPolicy = "no-referrer";
        frame.allow = "camera *; microphone *; display-capture *; autoplay *; fullscreen *; clipboard-write *";
      }
      const listen = (event: string, callback: (payload?: JitsiEvent) => void) => instance?.addListener(event, callback);
      listen("videoConferenceJoined", event => {
        if (cancelled || failed) return;
        window.clearTimeout(joinTimeout);
        localParticipantId.current = event?.id || "";
        setApiReady(true);
        setConnectionError("");
      });
      const left = () => {
        if (cancelled || failed) return;
        setApiReady(false); setJoined(false); setTicket(null); setParticipants([]);
        setActionMessage("You left the video room. You can rejoin while the lesson is open.");
      };
      listen("videoConferenceLeft", left);
      listen("readyToClose", left);
      listen("audioMuteStatusChanged", event => { if (!cancelled && typeof event?.muted === "boolean") setMuted(event.muted); });
      listen("videoMuteStatusChanged", event => { if (!cancelled && typeof event?.muted === "boolean") setCameraOff(event.muted); });
      listen("screenSharingStatusChanged", event => { if (!cancelled && typeof event?.on === "boolean") setSharing(event.on); });
      listen("participantJoined", event => {
        if (!cancelled && event?.id) setParticipants(current => current.some(person => person.id === event.id) ? current : [...current, { id: event.id!, displayName: event.displayName?.trim() || "Participant" }]);
      });
      listen("participantLeft", event => { if (!cancelled && event?.id) setParticipants(current => current.filter(person => person.id !== event.id)); });
      listen("raiseHandUpdated", event => { if (!cancelled && event?.id === localParticipantId.current) setHandRaised(!!event.handRaised); });
      listen("cameraError", () => { if (!cancelled) setActionMessage("Camera access was blocked. Allow camera access in your browser, then turn your camera on."); });
      listen("micError", () => { if (!cancelled) setActionMessage("Microphone access was blocked. Allow microphone access in your browser, then unmute."); });
      listen("browserSupport", event => { if (event?.supported === false) fail("This browser does not support the video room. Try a current version of Chrome, Edge, Firefox or Safari."); });
      listen("passwordRequired", () => fail("The video server requested another password. Ask the administrator to check JWT authentication; do not sign in to a separate Jitsi account."));
      listen("errorOccurred", event => {
        const description = describeJitsiError(event);
        console.warn("[LingoRoom] Jitsi error", { type: event?.type, name: event?.name, message: event?.message, isFatal: event?.isFatal });
        if (event?.isFatal || event?.type === "CONFIG" || event?.type === "CONNECTION") {
          fail(`The video connection failed (${description}). Check the JaaS App ID, API key pair and browser connection, then retry.`);
        } else if (!cancelled) {
          setConnectionError(`Jitsi reported: ${description}`);
        }
      });
      listen("peerConnectionFailure", () => {
        if (!cancelled) setConnectionError("The network connection to the video service failed. Check this browser’s connection and microphone/camera permissions, then retry.");
      });
      // Only the conference-joined event marks the room connected. Never use a guessed timer.
      joinTimeout = window.setTimeout(() => fail("The video provider did not confirm your join within 60 seconds. Your saved credentials, provider permissions or this browser’s connection may need checking. Retry, or ask support to test this lesson."), 60_000);
    }).catch((error: unknown) => fail(error instanceof Error ? error.message : "Could not connect to the classroom."));
    return () => {
      cancelled = true;
      document.removeEventListener("securitypolicyviolation", blockedByPolicy);
      window.clearTimeout(joinTimeout);
      if (apiRef.current === instance) apiRef.current = null;
      try { instance?.dispose(); } catch { /* safe unmount */ }
    };
  }, [joined, ticket, lessonId]);

  const reconnect = useCallback(() => {
    setTicket(null); setTicketError(""); setConnectionError(""); setApiReady(false);
    setParticipants([]); setSharing(false); setHandRaised(false); setJoined(true); setRetry(value => value + 1);
  }, []);
  const runCommand = useCallback((command: string, success?: string) => {
    try {
      if (!apiRef.current || !apiReady) throw new Error("The classroom is still connecting. Try again in a moment.");
      apiRef.current.executeCommand(command);
      if (success) setActionMessage(success);
    } catch (error) { setActionMessage(error instanceof Error ? error.message : "This control is not available right now."); }
  }, [apiReady]);
  useEffect(() => {
    if (!actionMessage) return;
    const timer = window.setTimeout(() => setActionMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else if (boxRef.current?.requestFullscreen) void boxRef.current.requestFullscreen().catch(() => setActionMessage("Fullscreen is not available in this browser."));
    else setActionMessage("Fullscreen is not available in this browser.");
  }, []);
  const leaveRoom = useCallback(() => {
    try { apiRef.current?.executeCommand("hangup"); } catch { /* disposal still closes the room */ }
    setJoined(false); setTicket(null); setApiReady(false); setSharing(false); setParticipants([]);
  }, []);

  if (videoProvider === "unconfigured") {
    return <section role="status" className="rounded-[26px] border border-amber-200 bg-white p-7 sm:p-10">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700"><Icon name="alert" width={25}/></span>
      <p className="mt-5 text-xs font-bold uppercase tracking-widest text-amber-700">Video integration required</p>
      <h2 className="mt-2 text-2xl font-bold text-teal-950">Let’s connect your classroom</h2>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">{videoMessage}</p>
      <p className="mt-3 text-sm leading-6 text-slate-500">{isAdmin ? "Configure the video integration below, then return to this lesson. No database migration is needed for these settings." : "Your teacher can switch this lesson to Google Meet or Zoom. Otherwise, ask the site administrator to finish the video setup."}</p>
      {isAdmin && <Link href="/admin/integrations#provider-video" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-800 px-5 py-3 text-sm font-bold text-white">Open video settings<Icon name="arrow" width={17}/></Link>}
    </section>;
  }

  if (!joined) {
    return (
      <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_70px_-36px_rgba(8,47,53,.45)]">
        <header className="relative overflow-hidden bg-[#0b2029] px-6 py-6 text-white sm:px-8">
          <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-teal-400/15 blur-3xl"/>
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-white/10 text-teal-200"><span className="text-xl font-black">L</span></span>
              <div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-teal-200">LINGORAIN · LEARNING STUDIO</p><h2 className="mt-1 text-2xl font-black tracking-tight">Your classroom, your space.</h2></div>
            </div>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-teal-50">Private session · {roomName}</span>
          </div>
          <p className="relative mt-5 max-w-2xl text-sm leading-6 text-slate-300">A focused space for live teaching, shared learning materials, screen presentations and interactive practice.</p>
        </header>
        <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.15fr_.85fr]">
          <div className="relative flex min-h-[270px] flex-col justify-between overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0c2932] via-[#123d43] to-[#0e655e] p-6 text-white">
            <div className="absolute -bottom-20 -right-12 h-64 w-64 rounded-full border-[28px] border-white/5"/>
            <div className="relative flex items-center justify-between"><span className="rounded-full bg-emerald-300/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-100">Secure video room</span><span className="text-xs text-white/60">Session #{lessonId}</span></div>
            <div className="relative">
              <div className="flex items-center gap-3"><span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/15 bg-white/10"><Icon name="video" width={27} height={27}/></span><div><p className="text-lg font-extrabold">A better way to learn together</p><p className="mt-1 text-xs text-white/65">Video · Screen share · Whiteboard · Materials</p></div></div>
              <div className="mt-6 grid grid-cols-3 gap-2">{([{ icon: "video", label: "Live video" }, { icon: "box", label: "Shared tools" }, { icon: "messages", label: "Live chat" }] as const).map(({ icon, label }) => <div key={label} className="rounded-xl border border-white/10 bg-black/10 px-3 py-3"><Icon name={icon} width={17} height={17}/><p className="mt-2 text-[10px] font-semibold text-white/75">{label}</p></div>)}</div>
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-teal-700">Before you enter</p><h3 className="mt-2 text-xl font-black tracking-tight text-slate-900">Your seat is reserved</h3>
            <div className="mt-5 rounded-xl border border-slate-200 px-4 py-3"><p className="text-xs font-bold text-slate-500">Joining as</p><p className="mt-1 text-sm font-semibold text-slate-800">{displayName} · {isTutor ? "Teacher" : "Student"}</p><p className="mt-1 text-[11px] leading-5 text-slate-400">Your account verifies your identity. No separate Jitsi login is needed.</p></div>
            <div className="mt-4 space-y-2 text-xs"><div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3"><span className="text-slate-500">Camera & microphone</span><span className="font-semibold text-slate-700">Browser will ask on entry</span></div><div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3"><span className="text-slate-500">Lesson starts</span><span className="font-semibold text-slate-800">{startLabel}</span></div></div>
            {actionMessage && <p role="status" className="mt-3 text-xs leading-5 text-teal-700">{actionMessage}</p>}
              <button type="button" onClick={reconnect} className="mt-5 inline-flex items-center justify-center gap-3 rounded-xl bg-teal-800 px-6 py-4 text-sm font-bold text-white shadow-lg shadow-teal-900/15 transition hover:-translate-y-0.5 hover:bg-teal-900">{isTutor ? "Enter LingoRoom" : "Enter classroom"}<Icon name="arrow" width={18}/></button>
            <p className="mt-3 text-[11px] leading-5 text-slate-400">Recording is off by default. Any recording must use the classroom’s consent flow.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section ref={boxRef} className="overflow-hidden rounded-[28px] border border-[#183b43] bg-[#091922] shadow-[0_28px_80px_-35px_rgba(7,42,48,.7)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0d222c] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-teal-300 to-emerald-500 text-[#073239]"><span className="text-lg font-black">L</span></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="text-sm tracking-wide text-white">LINGORAIN STUDIO</b><span className="rounded-full bg-rose-500/15 px-2 py-1 text-[9px] font-extrabold tracking-widest text-rose-200"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-rose-400"/>{apiReady ? "LIVE" : "JOINING"}</span></div><p className="mt-0.5 truncate text-[10px] text-slate-400">{roomName} · {participantCount} in room</p></div></div>
        <div className="flex flex-wrap items-center gap-2">
          {minutesLeft !== null && <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-slate-200 sm:inline-flex">{minutesLeft > 0 ? `${minutesLeft} min left` : "Overtime"}</span>}
          {sharing && <span className="rounded-full bg-amber-300/15 px-3 py-2 text-[10px] font-bold text-amber-100">Screen sharing</span>}
          <span role="status" className={`rounded-full px-3 py-2 text-[10px] font-bold ${apiReady ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-300/10 text-amber-100"}`}>{apiReady ? "Connected" : connectionError || ticketError ? "Not connected" : "Connecting…"}</span>
          <button type="button" onClick={toggleFullscreen} className={`${tool} bg-white/10 text-white hover:bg-white/15`}><Icon name="swap" width={15} height={15}/>Fullscreen</button>
          <button type="button" onClick={leaveRoom} className={`${tool} bg-rose-500/15 text-rose-100 hover:bg-rose-500/25`}><Icon name="close" width={15} height={15}/>Leave</button>
        </div>
      </header>
      {(connectionError || ticketError) && <div role="alert" className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-xs leading-6 text-rose-100"><span className="max-w-2xl">{connectionError || ticketError}</span><button type="button" onClick={reconnect} className="rounded-lg bg-white/10 px-3 py-2 font-bold">Retry connection</button></div>}
      {actionMessage && <div role="status" className="mx-4 mt-3 rounded-xl border border-teal-300/20 bg-teal-300/10 px-4 py-2.5 text-xs text-teal-50">{actionMessage}</div>}
      <div className="grid min-w-0 gap-3 p-2 sm:p-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${apiReady ? "bg-emerald-400" : "bg-amber-300"}`}/><p className="text-xs font-bold text-slate-100">{studioView === "video" ? "Live video room" : "Collaborative whiteboard"}</p></div><div className="flex rounded-xl border border-white/10 bg-white/5 p-1"><button type="button" onClick={() => setStudioView("video")} className={`rounded-lg px-3 py-2 text-[11px] font-bold ${studioView === "video" ? "bg-teal-300 text-[#082b31]" : "text-slate-300 hover:bg-white/10"}`}>Video room</button><button type="button" onClick={() => { setStudioView("board"); setTab("tools"); }} className={`rounded-lg px-3 py-2 text-[11px] font-bold ${studioView === "board" ? "bg-teal-300 text-[#082b31]" : "text-slate-300 hover:bg-white/10"}`}>Whiteboard</button></div></div>
          {/* Keep the iframe mounted while using the board: switching tabs must not hang up. */}
          <div style={{ display: studioView === "video" ? undefined : "none" }} className="relative overflow-hidden rounded-[22px] border border-white/10 bg-black">
            <div ref={videoMountRef} className="h-[56vh] min-h-[320px] w-full bg-[#07131b] sm:h-[64vh] sm:min-h-[400px]"/>
            {!apiReady && !connectionError && !ticketError && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#07131b]/85"><div className="text-center text-white"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-teal-300/10 text-teal-200"><Icon name="video" width={24}/></span><p className="mt-3 text-sm font-bold">{ticket ? "Preparing your live classroom" : "Authorizing your classroom seat"}</p><p className="mt-1 text-xs text-white/55">{ticket ? "Waiting for the video provider to confirm your join…" : "Checking your lesson and secure video access…"}</p></div></div>}
          </div>
          {studioView === "board" && <div className="overflow-hidden rounded-[22px] border border-white/10 bg-white"><ClassroomTeachingWorkspace key={`board-${lessonId}`} lessonId={lessonId} books={books} isTutor={isTutor} userId={userId} initialTab="board"/></div>}
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-[20px] border border-white/10 bg-[#102832] p-3">
            <button type="button" disabled={!apiReady} onClick={() => runCommand("toggleAudio", muted ? "Microphone enabled" : "Microphone muted")} className={`${tool} min-w-[86px] ${muted ? "bg-rose-500 text-white" : "bg-white/10 text-white hover:bg-white/15"}`}><Icon name="messages" width={16} height={16}/>{muted ? "Unmute" : "Mute"}</button>
            <button type="button" disabled={!apiReady} onClick={() => runCommand("toggleVideo", cameraOff ? "Camera enabled" : "Camera off")} className={`${tool} min-w-[86px] ${cameraOff ? "bg-rose-500 text-white" : "bg-white/10 text-white hover:bg-white/15"}`}><Icon name="video" width={16} height={16}/>{cameraOff ? "Camera on" : "Camera off"}</button>
            <button type="button" disabled={!apiReady} onClick={() => runCommand("toggleShareScreen", sharing ? "Screen sharing stopped" : "Choose a screen or window to share")} className={`${tool} min-w-[112px] ${sharing ? "bg-amber-300 text-slate-950" : "bg-teal-300 text-[#082b31] hover:bg-teal-200"}`}><Icon name="copy" width={16} height={16}/>{sharing ? "Stop sharing" : "Share screen"}</button>
            <button type="button" disabled={!apiReady} onClick={() => runCommand("toggleRaiseHand")} className={`${tool} bg-white/10 text-white hover:bg-white/15`}><Icon name="user" width={16} height={16}/>{handRaised ? "Lower hand" : "Raise hand"}</button>
            <button type="button" disabled={!apiReady} onClick={() => runCommand("toggleTileView", "Video layout changed")} className={`${tool} bg-white/10 text-white hover:bg-white/15`}><Icon name="chart" width={16} height={16}/>Layout</button>
            <button type="button" onClick={() => { setStudioView("board"); setTab("tools"); }} className={`${tool} bg-white/10 text-white hover:bg-white/15`}><Icon name="box" width={16} height={16}/>Open board</button>
          </div>
          <p className="px-1 text-[10px] leading-5 text-slate-500">Screen sharing uses your browser’s permission prompt. Only the screen or window you select is shared. {studioView === "board" && "Your video call remains connected while the board is open."}</p>
        </div>
        <aside className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[22px] border border-white/10 bg-[#f9fbfa] lg:h-[calc(64vh+150px)] lg:min-h-[550px]">
          <div className="border-b border-slate-200 bg-white px-4 py-4"><p className="text-[10px] font-extrabold uppercase tracking-[.18em] text-teal-700">Your learning space</p><h3 className="mt-1 text-lg font-black tracking-tight text-slate-900">Session workspace</h3><p className="mt-1 text-[11px] text-slate-500">Plan, people, notes and shared tools.</p></div>
          <nav className="grid grid-cols-5 border-b border-slate-200 bg-white px-2">{tabs.map(item => <button key={item.id} type="button" onClick={() => { setTab(item.id); if (item.id === "tools") setStudioView("video"); }} aria-pressed={tab === item.id} className={`flex flex-col items-center gap-1 border-b-2 px-1 py-3 text-[9px] font-bold transition ${tab === item.id ? "border-teal-700 text-teal-800" : "border-transparent text-slate-400 hover:text-slate-700"}`}><Icon name={item.icon} width={16} height={16}/>{item.label}</button>)}</nav>
          <div className="min-h-0 min-w-0 flex-1 overflow-auto p-3 sm:p-4">
            {tab === "plan" && <div className="space-y-3">{[["01", "Warm up", "Start with a short conversation and review."], ["02", "Today's focus", "Introduce the target vocabulary and grammar."], ["03", "Guided practice", "Practice together and make live corrections."], ["04", "Speak freely", "Use the new language in a real conversation."], ["05", "Wrap up", "Review progress and agree on next steps."]].map(([n, title, description]) => <div key={n} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-teal-50 text-[10px] font-black text-teal-800">{n}</span><div><p className="text-xs font-bold text-slate-800">{title}</p><p className="mt-1 text-[10px] leading-5 text-slate-500">{description}</p></div></div>)}</div>}
            {tab === "people" && <div className="space-y-3"><div className="rounded-xl bg-teal-50 p-3"><p className="text-xs font-bold text-teal-900">In this session</p><p className="mt-1 text-[11px] text-teal-800">{participantCount} participant{participantCount === 1 ? "" : "s"} connected to this room.</p></div>{[
              ...(apiReady ? [{ id: "self", name: ticket?.displayName || displayName, role: isTutor ? "Teacher · You" : "Student · You", self: true }] : []),
              ...participants.map(person => ({ id: person.id, name: person.displayName, role: "Participant", self: false })),
            ].map(person => <div key={person.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-teal-100 to-emerald-100 text-xs font-black text-teal-800">{person.name.slice(0, 1).toUpperCase()}</span><div><p className="text-xs font-bold text-slate-800">{person.name}</p><p className="text-[10px] text-slate-400">{person.role}</p></div>{person.self && <span className="ml-auto rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">You</span>}</div>)}</div>}
            {tab === "notes" && <div><div className="rounded-xl bg-amber-50 p-3"><p className="text-xs font-bold text-amber-900">Private session notes</p><p className="mt-1 text-[10px] leading-5 text-amber-800">Only visible in this browser session. Write down new words, corrections or reminders.</p></div><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={14} placeholder="New vocabulary, pronunciation notes, next lesson goals…" className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-700 outline-none focus:border-teal-500"/></div>}
            {tab === "tools" && (studioView === "board" ? <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4"><p className="text-xs font-bold text-teal-950">Whiteboard is open</p><p className="mt-2 text-[11px] leading-5 text-teal-900">Use the shared board beside this panel. Your video call stays connected.</p><button type="button" onClick={() => setStudioView("video")} className="mt-3 rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white">Back to video</button></div> : <ClassroomTeachingWorkspace lessonId={lessonId} books={books} isTutor={isTutor} userId={userId}/>)}
            {tab === "chat" && <ClassroomChat lessonId={lessonId} userId={userId}/>}
          </div>
          <footer className="border-t border-slate-200 bg-white px-4 py-3"><p className="text-[10px] leading-5 text-slate-400">Lingorain Studio · A private learning space for this lesson.</p></footer>
        </aside>
      </div>
    </section>
  );
}
