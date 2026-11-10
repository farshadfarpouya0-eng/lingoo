"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { roomPollDelay } from "@/lib/room-polling";
import type { LearningCopy } from "@/lib/learning-i18n";
import type { Platform, RoomSnapshot } from "@/lib/room-service";
import { saveClassroom } from "@/lib/classroom-actions";
import Icon from "./Icon";
import LingoRoom from "./LingoRoom";
import type { ClassroomMaterial } from "@/lib/classroom-material";

export type AssignedLinks = { meet: boolean; zoom: boolean; meetUrl?: string; zoomUrl?: string };
const NO_LINKS: AssignedLinks = { meet: false, zoom: false };

const D = {
  tutorPick: "Choose the classroom",
  tutorPickText: "Only you, the tutor, can choose or change the classroom. The student will see the room you select.",
  studentWaitingTitle: "Your tutor is choosing the classroom",
  studentWaitingText: "You cannot choose the classroom. This page updates automatically when your tutor selects a room.",
  switchTitle: "Change the classroom",
  lingo: "Lingo Room", lingoDesc: "Secure embedded video — no separate Jitsi login.",
  lingoOff: "Video setup is required. Ask the administrator to connect JaaS or a private Jitsi server, or choose another available classroom.",
  daily: "Daily secure room", dailyDesc: "Private video room with optional consent-based cloud recording.",
  meet: "Google Meet", meetDesc: "Opens in a new tab. Set up by your tutor.",
  zoom: "Zoom", zoomDesc: "Opens in Zoom. Set up by your tutor.",
  tutorOnly: "Only your tutor can use Google Meet or Zoom. Pick Lingo Room.",
  assignedDesc: "Your school's fixed room. Opens in a new tab.",
  assignedLabel: "Room assigned by the administrator",
  noAssigned: "No fixed room is assigned yet. Paste a link, or ask the administrator to add one in Admin → Tutors.",
  link: "Meeting link", linkHint: "Paste your Google Meet or Zoom link",
  save: "Save classroom", saved: "Classroom saved",
  invalidLink: "That doesn't look like a valid Google Meet or Zoom link.",
  dailyLoading: "Preparing a previously scheduled video room…",
  dailyError: "The secure room could not be opened. Try again or pick another room.",
  closed: "This lesson has ended.", forbidden: "You can't change the classroom for this lesson.",
  pendingTitle: "Classroom not chosen yet",
  pendingText: "Choose a classroom above. The student will see it automatically. The countdown below is accurate.",
  pendingConfirm: "This lesson isn't confirmed yet",
  startsAt: "Starts",
  live: "Live sync", syncError: "Reconnecting…",
  report: "Report a problem", issueSent: "Problem reported — support will review it.",
  reportHint: "If the video or audio fails, report the problem here.",
  rules: "The classroom can be changed until the lesson ends. Everyone is notified when it changes.",
  notice: "The classroom was updated.",
};

const STEP_LABELS = ["Booked", "Confirmed", "Classroom", "Ready", "Live", "Done"];

function Timeline({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {STEP_LABELS.map((label, i) => {
        const done = i < step;
        const now = i === step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
              now ? "bg-teal-800 text-white" : done ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-400"
            }`}>
              <span className={`grid h-4 w-4 place-items-center rounded-full text-[9px] ${done || now ? "bg-teal-700 text-white" : "bg-slate-300 text-white"}`}>
                {done ? "✓" : i + 1}
              </span>
              {label}
            </span>
            {i < STEP_LABELS.length - 1 && <span className={`h-px w-4 ${done ? "bg-teal-400" : "bg-slate-200"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

const fmtSpan = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`);

/** Tutors may enter 30 minutes early, students 10 — matching roomState() on the server. */
function Countdown({ startAtMs, durationMinutes, earlyMinutes, serverNowMs }: { startAtMs: number; durationMinutes: number; earlyMinutes: number; serverNowMs: number }) {
  // Anchor the countdown to server time so a device clock that is hours ahead/behind
  // cannot display a false remaining duration. Date.now() is used only for elapsed time.
  const [clientBase] = useState(() => Date.now());
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(value => value + 1), 1_000);
    return () => clearInterval(t);
  }, []);
  const now = serverNowMs + (Date.now() - clientBase);

  const toStart = startAtMs - now;
  const toEnd = startAtMs + durationMinutes * 60_000 - now;

  if (toStart <= 0) {
    if (toEnd > 0) {
      return (
        <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          Live now · {Math.floor(toEnd / 60_000)} min left
        </span>
      );
    }
    return <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">This lesson has ended</span>;
  }

  const m = Math.ceil(toStart / 60_000);
  const opens = Math.max(0, Math.ceil((toStart - earlyMinutes * 60_000) / 60_000));
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800">
      <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
      {opens > 0 ? `Room opens in ${fmtSpan(opens)}` : "Room is opening"} · starts in {fmtSpan(m)}
    </span>
  );
}

function PlatformForm({ lessonId, initial, preference, onSaved, isTutor, assigned }: {
  lessonId: number; initial: RoomSnapshot; preference: string; onSaved: () => void; isTutor: boolean; assigned: AssignedLinks;
}) {
  const hasAssigned = (p: string) => (p === "meet" && assigned.meet) || (p === "zoom" && assigned.zoom);
  // This form is rendered only for the tutor; keep the guard defensive.
  const allowed = (_p: string) => isTutor;
  const startPlatform = initial.platform === "undecided"
    ? (allowed(preference) ? preference : "lingo")
    : initial.platform;

  const [platform, setPlatform] = useState<string>(startPlatform);
  const [link, setLink] = useState(initial.meetingUrl);
  const [result, action, pending] = useActionState(saveClassroom, {} as { ok?: boolean; error?: string });
  useEffect(() => { if (result?.ok) onSaved(); }, [result, onSaved]);

  const cards: { key: Platform; code: string; title: string; desc: string; tag: string }[] = [
    { key: "lingo", code: "LR", title: D.lingo, desc: D.lingoDesc, tag: initial.videoProvider === "unconfigured" ? "SETUP" : "SECURE" },
    { key: "meet", code: "GM", title: D.meet, desc: assigned.meet ? D.assignedDesc : D.meetDesc, tag: assigned.meet ? "READY" : isTutor ? "LINK" : "TUTOR" },
    { key: "zoom", code: "ZM", title: D.zoom, desc: assigned.zoom ? D.assignedDesc : D.zoomDesc, tag: assigned.zoom ? "READY" : isTutor ? "LINK" : "TUTOR" },
  ];

  const errorText =
    result?.error === "link" ? D.invalidLink :
    result?.error === "closed" ? D.closed : D.forbidden;

  return (
    <form action={action as unknown as (fd: FormData) => Promise<void>} className="rounded-[26px] border border-slate-200 bg-white p-6">
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="platform" value={platform} />

      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Icon name="swap" /></div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-teal-950">
            {initial.platform === "undecided" ? D.tutorPick : D.switchTitle}
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">{D.tutorPickText}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(card => {
          const on = platform === card.key;
          const locked = !allowed(card.key);
          return (
            <button
              type="button" key={card.key}
              disabled={locked}
              onClick={() => { setPlatform(card.key); if (card.key !== platform) setLink(""); }}
              aria-pressed={on}
              className={`rounded-2xl border-2 p-4 text-left transition ${
                locked ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
                  : on ? "border-teal-700 bg-teal-50" : "border-slate-200 hover:border-teal-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`grid h-8 w-8 place-items-center rounded-lg text-[10px] font-bold ${on ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-500"}`}>{card.code}</span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider ${on ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-400"}`}>{card.tag}</span>
              </div>
              <p className={`mt-3 text-sm font-bold ${on ? "text-teal-950" : "text-slate-700"}`}>{card.title}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">{locked ? D.tutorOnly : card.desc}</p>
            </button>
          );
        })}
      </div>

      {platform === "lingo" && initial.videoProvider === "unconfigured" && <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">{D.lingoOff}</p>}

      {(platform === "meet" || platform === "zoom") && hasAssigned(platform) && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
          <p className="font-bold">{D.assignedLabel}</p>
          {isTutor && <p className="mt-1 break-all font-mono text-[11px]">{platform === "meet" ? assigned.meetUrl : assigned.zoomUrl}</p>}
          <p className="mt-1 text-emerald-800">Just press Save — no link needed.{platform === "zoom" ? " Free Zoom ends after 40 minutes from when the tutor opens it, so open it shortly before class." : ""}</p>
        </div>
      )}

      {isTutor && (platform === "meet" || platform === "zoom") && !hasAssigned(platform) && (
        <label className="mt-5 block text-xs font-bold text-slate-600">
          {D.link}
          <input
            name="meetingUrl" type="url" required value={link}
            onChange={e => setLink(e.target.value)}
            placeholder={platform === "meet" ? "https://meet.google.com/abc-defg-hij" : "https://zoom.us/j/123456789"}
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-teal-500"
          />
          <span className="mt-2 block text-[11px] font-normal text-slate-400">{D.linkHint} · {D.noAssigned}</span>
        </label>
      )}

      {result?.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{errorText}</p>}
      {result?.ok && <p role="status" className="mt-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{D.saved}</p>}

      <button disabled={pending} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-teal-800 px-6 py-3 text-sm font-bold text-white transition hover:bg-teal-900 disabled:opacity-50">
        {pending ? "Saving…" : D.save}<Icon name="arrow" width={17} height={17} />
      </button>
    </form>
  );
}

export default function ClassroomLive({ initial, isTutor, displayName, isAdmin = false, profileTimeZone = "UTC", assignedLinks = NO_LINKS, preference, c, startLabel, startAtMs, serverNowMs, durationMinutes, books, userId, autoJoin = false }: {
  initial: RoomSnapshot; isTutor: boolean; displayName: string; isAdmin?: boolean; profileTimeZone?: string; assignedLinks?: AssignedLinks; preference: string; c: LearningCopy; autoJoin?: boolean;
  startLabel: string; startAtMs: number; serverNowMs: number; durationMinutes: number;
  books: ClassroomMaterial[];
  userId: number;
}) {
  const [room, setRoom] = useState(initial);
  useEffect(() => {
    if (autoJoin && !isTutor && initial.state === "open" &&
      (initial.platform === "meet" || initial.platform === "zoom") && initial.joinUrl) {
      // Same-tab navigation avoids pop-up blockers and keeps dashboard entry to one click.
      window.location.assign(initial.joinUrl);
    }
  }, [autoJoin, isTutor, initial.state, initial.platform, initial.joinUrl]);
  const [deviceStart, setDeviceStart] = useState("");
  useEffect(() => {
    // Rendered after mount to avoid hydration mismatch; shown only when the device zone differs.
    const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!deviceZone || deviceZone === profileTimeZone) return;
    const label = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: deviceZone }).format(new Date(startAtMs));
    setDeviceStart(`${label} (${deviceZone})`);
  }, [profileTimeZone, startAtMs]);
  const [clientClockBase] = useState(() => Date.now());
  const [updated, setUpdated] = useState(false);
  const [offline, setOffline] = useState(false);
  const busy = useRef(false);
  const [failures, setFailures] = useState(0);
  const revision = useRef(initial.revision);
  const earlyMinutes = isTutor ? 30 : 10;

  /* Daily rooms need a personal token from the server before they can open. */
  const [dailyUrl, setDailyUrl] = useState("");
  const [dailyJoined, setDailyJoined] = useState(autoJoin && !isTutor && initial.state === "open" && initial.platform === "daily");
  const [dailyError, setDailyError] = useState("");
  const [dailyRetry, setDailyRetry] = useState(0);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const openTeacherRoom = useCallback(async () => {
    setLaunchError(""); setLaunchBusy(true);
    // Open synchronously so popup blockers treat this as a user gesture.
    const win = window.open("about:blank", "_blank");
    try {
      const response = await fetch(`/api/lessons/${room.lessonId}/teacher-launch`, { method: "POST", cache: "no-store" });
      const data = await response.json() as { url?: string; error?: string; notice?: string };
      if (!response.ok || !data.url) throw new Error(data.error || "Could not prepare the teacher room.");
      if (win) { win.opener = null; win.location.href = data.url; }
      else window.open(data.url, "_blank", "noopener,noreferrer");
      if (data.notice) setLaunchError(data.notice);
    } catch (error) {
      if (win) win.close();
      setLaunchError(error instanceof Error ? error.message : "Could not open the teacher room.");
    } finally { setLaunchBusy(false); }
  }, [room.lessonId]);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await fetch(`/api/lessons/${initial.lessonId}/room`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error("sync");
      const data = await r.json() as RoomSnapshot;
      if (data.revision !== revision.current) { revision.current = data.revision; setUpdated(true); }
      setRoom(prev => prev.revision === data.revision && prev.state === data.state && prev.issueReported === data.issueReported && prev.joinUrl === data.joinUrl ? prev : data);
      setFailures(0);
      setOffline(false);
    } catch {
      setFailures(n => n + 1);
      setOffline(true);
    } finally {
      busy.current = false;
    }
  }, [initial.lessonId]);

  useEffect(() => {
    if (room.platform !== "daily" || room.state !== "open" || !dailyJoined) return;
    const controller = new AbortController();
    let cancelled = false;
    const timer = window.setTimeout(() => controller.abort(), 30_000);
    setDailyError("");
    fetch(`/api/lessons/${room.lessonId}/daily-token`, { method: "POST", cache: "no-store", signal: controller.signal })
      .then(async r => {
        const d = await r.json() as { joinUrl?: string; error?: string };
        if (!r.ok || !d.joinUrl) throw new Error(d.error || D.dailyError);
        if (!cancelled) setDailyUrl(d.joinUrl);
      })
      .catch((error: unknown) => {
        if (!cancelled) setDailyError(error instanceof Error && error.name !== "AbortError" && error.message ? error.message : D.dailyError);
      })
      .finally(() => window.clearTimeout(timer));
    return () => { cancelled = true; window.clearTimeout(timer); controller.abort(); };
  }, [room.lessonId, room.platform, room.state, room.revision, dailyRetry, dailyJoined]);

  const pollDelay = roomPollDelay(room.state, offline ? failures : 0);
  useEffect(() => {
    if (!pollDelay) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, pollDelay);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
    };
  }, [refresh, pollDelay]);

  const step =
    room.state === "closed" ? 5 :
    room.platform === "undecided" ? 2 :
    room.state === "open" ? 4 :
    room.state === "early" ? 3 : 1;

  const opensText = `The classroom opens ${earlyMinutes} minutes before the lesson`;
  const estimatedServerNowMs = serverNowMs + (Date.now() - clientClockBase);
  const minutesLeft = Math.max(0, Math.round((startAtMs + durationMinutes * 60_000 - estimatedServerNowMs) / 60_000));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] border border-slate-200 bg-white px-5 py-4">
        <Timeline step={step} />
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span className={`h-1.5 w-1.5 rounded-full ${offline ? "bg-amber-500" : "bg-teal-500"}`} />
          {offline ? D.syncError : D.live}
        </span>
      </div>

      {updated && (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          <Icon name="swap" className="shrink-0" />
          <p className="flex-1">{D.notice}</p>
          <button type="button" aria-label="Close" onClick={() => setUpdated(false)}><Icon name="close" width={16} height={16} /></button>
        </div>
      )}

      {isTutor && room.issueReported && (
        <p role="alert" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Icon name="alert" className="shrink-0" />The student reported a connection problem.
        </p>
      )}

      {isTutor && room.state !== "closed" && (
        <PlatformForm lessonId={room.lessonId} initial={room} preference={preference} onSaved={refresh} isTutor={isTutor} assigned={assignedLinks} />
      )}

      {room.state === "open" && room.platform === "lingo" ? (
        <LingoRoom
          roomName={`lingorain-${room.lessonId}`}
          displayName={displayName}
          videoProvider={room.videoProvider}
          videoMessage={room.videoMessage}
          startLabel={startLabel}
          minutesLeft={minutesLeft}
          isTutor={isTutor}
          isAdmin={isAdmin}
          lessonId={room.lessonId}
          books={books}
          userId={userId}
          autoJoin={autoJoin && !isTutor && initial.state === "open"}
        />
      ) : room.state === "open" && room.platform === "daily" && !dailyJoined ? (
        <section className="rounded-[26px] border border-amber-200 bg-white px-6 py-12 text-center">
          <h2 className="text-xl font-bold text-teal-950">Previously scheduled video room</h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-slate-600">This lesson was assigned to Daily before it was removed from new classroom options. Your tutor can switch it to LingoRoom, Meet or Zoom.</p>
          <button type="button" onClick={() => setDailyJoined(true)} className="mt-5 rounded-xl bg-teal-800 px-8 py-3.5 font-bold text-white">Enter classroom</button>
        </section>
      ) : room.state === "open" && room.platform === "daily" && dailyUrl ? (
        <section className="overflow-hidden rounded-[26px] border border-slate-200 bg-[#153d39]">
          <div className="flex items-center justify-between px-5 py-3 text-xs text-white">
            <b>{D.daily}</b>
            {isTutor && <a href={dailyUrl} target="_blank" rel="noopener noreferrer" className="text-teal-100 hover:text-white">Open in a new tab ↗</a>}
          </div>
          <iframe
            key={dailyUrl}
            title={D.daily}
            src={dailyUrl}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            className="h-[70vh] min-h-[460px] w-full bg-slate-950"
          />
        </section>
      ) : room.state === "open" && room.platform === "daily" && dailyError ? (
        <section className="rounded-[26px] border border-amber-200 bg-amber-50 p-8 text-center">
          <p className="text-sm font-semibold text-amber-900">{dailyError}</p>
          <p className="mt-2 text-xs text-amber-800">{D.dailyError}</p>
          <button type="button" onClick={() => { setDailyUrl(""); setDailyError(""); setDailyRetry(value => value + 1); void refresh(); }} className="mt-4 rounded-xl bg-teal-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-900">Try again</button>
        </section>
      ) : room.state === "open" && room.platform === "daily" ? (
        <section className="rounded-[26px] border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">{D.dailyLoading}</section>
      ) : room.state === "open" && (room.platform === "meet" || room.platform === "zoom") && room.joinUrl ? (
        <section className="rounded-[26px] border border-slate-200 bg-white px-6 py-14 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Icon name="video" width={30} height={30} /></div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-slate-400">Join lesson</p>
          <h2 className="mt-2 text-3xl font-bold text-teal-950">{room.platform === "meet" ? D.meet : D.zoom}</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">{room.platform === "meet" ? D.meetDesc : D.zoomDesc}</p>
          {isTutor ? (
            <button type="button" onClick={() => void openTeacherRoom()} disabled={launchBusy} className="mt-6 inline-flex items-center gap-3 rounded-xl bg-teal-800 px-8 py-3.5 font-bold text-white hover:bg-teal-900 disabled:opacity-50">
              {launchBusy ? "Preparing teacher room…" : "Open as teacher"}<Icon name="arrow" />
            </button>
          ) : (
            <a href={room.joinUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-3 rounded-xl bg-teal-800 px-8 py-3.5 font-bold text-white hover:bg-teal-900">
              Open the classroom<Icon name="arrow" />
            </a>
          )}
          {isTutor && <p className="mx-auto mt-3 max-w-md text-xs leading-5 text-slate-400">Admin-managed launch: when the room is configured for guest/open access or Zoom host refresh, you should not need a separate Google/Zoom login.</p>}
          {launchError && <p role="alert" className="mx-auto mt-4 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{launchError}</p>}
        </section>
      ) : (
        <section className="rounded-[26px] border border-slate-200 bg-white p-10 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-slate-50 text-teal-700">
            <Icon name={room.state === "closed" ? "check" : room.platform === "undecided" ? "swap" : "clock"} width={28} height={28} />
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-widest text-slate-400">
            {room.state === "closed" ? "Lesson finished" : room.platform === "undecided" ? (isTutor ? "Classroom not chosen" : "Awaiting tutor selection") : "Not started yet"}
          </p>
          <h2 className="mt-3 text-2xl font-bold text-teal-950">
            {room.state === "closed" ? D.closed : room.platform === "undecided" ? (isTutor ? D.pendingTitle : D.studentWaitingTitle) : room.state === "pending" ? D.pendingConfirm : opensText}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
            {room.state === "closed"
              ? "Thank you for joining. Leave a review from your dashboard."
              : room.platform === "undecided"
                ? (isTutor ? D.pendingText : D.studentWaitingText)
                : "The room unlocks automatically — no need to refresh."}
          </p>

          {room.state !== "closed" && (
            <div className="mt-5 flex justify-center">
              <Countdown startAtMs={startAtMs} durationMinutes={durationMinutes} earlyMinutes={earlyMinutes} serverNowMs={serverNowMs} />
            </div>
          )}

          <div className="mx-auto mt-6 grid max-w-md gap-2 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{D.startsAt}</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{startLabel}</p>
              <p className="mt-1 text-[10px] text-slate-400">{profileTimeZone} · profile time zone</p>
              {deviceStart && <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-semibold leading-4 text-amber-800">On this device: {deviceStart}. Update Profile → Time zone if this is your location.</p>}
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Length</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{durationMinutes} min</p>
            </div>
          </div>
        </section>
      )}

      {isTutor && <p className="text-xs leading-5 text-slate-400">{D.rules}</p>}
      {!isTutor && room.state === "open" && <p className="text-xs leading-5 text-slate-500">If you cannot connect, use “Report a lesson issue” below. Only your tutor can change the room.</p>}
    </div>
  );
}
