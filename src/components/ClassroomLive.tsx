"use client";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { roomPollDelay } from "@/lib/room-polling";
import type { LearningCopy } from "@/lib/learning-i18n";
import type { Platform, RoomSnapshot } from "@/lib/room-service";
import { requestClassroomSwitch, saveClassroom } from "@/lib/learning-actions";
import Icon from "./Icon";

function PlatformForm({ lessonId, initial, c, preference, onSaved }: { lessonId: number; initial: RoomSnapshot; c: LearningCopy; preference: string; onSaved: () => void }) {
  const [platform,setPlatform] = useState(initial.platform === "undecided" ? preference : initial.platform);
  const [link,setLink] = useState(initial.meetingUrl);
  const [result, action, pending] = useActionState(saveClassroom, null);
  useEffect(() => { if(result?.ok) onSaved(); }, [result, onSaved]);
  return <form action={action} className="rounded-2xl border border-slate-200 bg-white p-5">
    <input type="hidden" name="lessonId" value={lessonId}/><input type="hidden" name="platform" value={platform}/>
    <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700"><Icon name="swap"/></div><div><h2 className="font-bold text-teal-950">{initial.platform === "undecided" ? c.choosePlatform : c.switchPlatform}</h2><p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">{c.switchHint}</p></div></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{(["lingo","daily","meet","zoom"] as const).map((p,i) => <button type="button" key={p} onClick={() => {setPlatform(p);if(p!==platform)setLink("");}} aria-pressed={platform===p} className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition ${platform===p ? "border-teal-700 bg-teal-50 text-teal-900" : "border-slate-200 text-slate-500 hover:border-teal-300"}`}><span className={`grid h-7 w-7 place-items-center rounded-lg text-[10px] ${platform===p ? "bg-teal-700 text-white" : "bg-slate-100"}`}>{["LR","DA","GM","ZM"][i]}</span>{p==="lingo"?c.roomLingo:p==="daily"?"Daily (private room + recording)":p==="meet"?c.roomMeet:c.roomZoom}</button>)}</div>
    {platform!=="lingo" && platform!=="daily" && <label className="mt-4 block text-xs font-bold text-slate-600">{c.link}<input name="meetingUrl" type="url" required value={link} onChange={e=>setLink(e.target.value)} placeholder={platform==="meet"?"https://meet.google.com/abc-defg-hij":"https://zoom.us/j/123456789"} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-normal outline-none focus:border-teal-500"/><span className="mt-2 block text-[11px] font-normal text-slate-400">{c.linkHint}</span></label>}
    {result?.error && <p role="alert" className="mt-3 text-sm text-red-600">{result.error==="link"?c.invalidLink:result.error==="closed"?c.closed:c.forbidden}</p>}
    {result?.ok && <p role="status" className="mt-3 text-xs font-medium text-teal-700">{c.platformSaved}</p>}
    <button disabled={pending} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">{pending?"…":c.savePlatform}<Icon name="arrow" width={16} height={16}/></button>
  </form>;
}
export default function ClassroomLive({ initial, isTutor, preference, c, startLabel }: { initial: RoomSnapshot; isTutor: boolean; preference: string; c: LearningCopy; startLabel: string }) {
  const [room,setRoom] = useState(initial);
  const [updated,setUpdated] = useState(false);
  const [offline,setOffline] = useState(false);
  const [issuePending,startIssue] = useTransition();
  const [copied,setCopied] = useState(false);
  const [dailyJoinUrl,setDailyJoinUrl] = useState("");
  const [dailyError,setDailyError] = useState("");
  const busy=useRef(false);
  const [failures,setFailures]=useState(0);
  const revision=useRef(initial.revision);
  const refresh = useCallback(async () => {
    if(busy.current)return;
    busy.current=true;
    try {
      const response=await fetch(`/api/lessons/${initial.lessonId}/room`,{cache:"no-store",signal:AbortSignal.timeout(12000)});
      if(!response.ok) throw new Error("sync");
      const data=await response.json() as RoomSnapshot;
      if(data.revision!==revision.current){revision.current=data.revision;setUpdated(true);}
      setRoom(prev => prev.revision===data.revision&&prev.state===data.state&&prev.issueReported===data.issueReported&&prev.joinUrl===data.joinUrl ? prev : data);
      setFailures(0);
      setOffline(false);
    } catch { setFailures(count=>count+1);setOffline(true); }
    finally {busy.current=false;}
  },[initial.lessonId]);
  const pollDelay=roomPollDelay(room.state,offline?failures:0);
  useEffect(() => {
    let cancelled = false;
    if (room.platform !== "daily" || room.state !== "open") { setDailyJoinUrl(""); setDailyError(""); return; }
    setDailyError("");
    fetch(`/api/lessons/${initial.lessonId}/daily-token`, { method: "POST", cache: "no-store" })
      .then(async r => { const d = await r.json() as { joinUrl?: string; error?: string }; if (!r.ok || !d.joinUrl) throw new Error(d.error || "Could not create secure video token."); if (!cancelled) setDailyJoinUrl(d.joinUrl); })
      .catch(e => { if (!cancelled) setDailyError(e instanceof Error ? e.message : "Daily setup failed."); });
    return () => { cancelled = true; };
  }, [initial.lessonId, room.platform, room.state, room.revision]);
  useEffect(() => {
    if(!pollDelay)return;
    const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},pollDelay);
    const visible=()=>{if(document.visibilityState==="visible")void refresh();};
    document.addEventListener("visibilitychange",visible);window.addEventListener("focus",visible);
    return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",visible);window.removeEventListener("focus",visible);};
  },[refresh,pollDelay]);
  const labels: Record<Platform,string>={undecided:c.pendingBadge,lingo:c.roomLingo,daily:"Daily secure room",meet:c.roomMeet,zoom:c.roomZoom};
  const descriptions: Record<Platform,string>={undecided:c.pendingText,lingo:c.lingoDesc,daily:"Private Daily room with participant access tokens and optional cloud recording.",meet:c.meetDesc,zoom:c.zoomDesc};
  const joinUrl = room.platform === "daily" ? dailyJoinUrl : room.joinUrl;
  const report=()=>startIssue(async()=>{const result=await requestClassroomSwitch(room.lessonId);if(result.ok)await refresh();});
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"><span className="flex items-center gap-2 text-xs font-semibold text-slate-500"><span className={`h-1.5 w-1.5 rounded-full ${offline?"bg-amber-500":"bg-teal-500"}`}/>{offline?c.syncError:c.liveSync}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${room.platform==="undecided"?"bg-slate-100 text-slate-500":"bg-teal-50 text-teal-700"}`}>{labels[room.platform]}</span></div>
    {updated && <div role="status" className="flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800"><Icon name="swap" className="shrink-0"/><p className="flex-1">{c.switchNotice}</p><button type="button" aria-label={c.close} onClick={()=>setUpdated(false)}><Icon name="close" width={16} height={16}/></button></div>}
    {isTutor && room.issueReported && <p role="alert" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><Icon name="alert" className="shrink-0"/>{c.tutorIssue}</p>}
    {isTutor && room.state!=="closed" && <PlatformForm lessonId={room.lessonId} initial={room} preference={preference} c={c} onSaved={refresh}/>}
    {room.state==="open" && room.platform!=="undecided" && joinUrl ? <>
      {(room.platform==="lingo" || room.platform==="daily") ? <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-[#153d39]"><div className="flex items-center justify-between px-5 py-3 text-xs text-white"><b>{room.platform === "daily" ? "Daily secure room" : c.roomLingo}</b><a href={joinUrl} target="_blank" rel="noopener noreferrer" className="text-teal-100 hover:text-white">{c.openTab} ↗</a></div><iframe key={joinUrl} title={room.platform === "daily" ? "Daily secure room" : c.roomLingo} src={joinUrl} allow="camera; microphone; fullscreen; display-capture; autoplay" className="h-[65vh] w-full bg-slate-950"/></div> : <section className="rounded-[24px] border border-slate-200 bg-white px-6 py-14 text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-teal-50 text-teal-700"><Icon name="video" width={30} height={30}/></div><p className="mt-6 text-xs font-semibold uppercase tracking-widest text-slate-400">{c.join}</p><h2 className="mt-2 text-3xl font-bold text-teal-950">{labels[room.platform]}</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">{descriptions[room.platform]}</p><a href={joinUrl} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-3 rounded-xl bg-teal-800 px-8 py-3.5 font-bold text-white hover:bg-teal-900">{c.join}<Icon name="arrow"/></a><div className="mt-5"><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(joinUrl);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{setCopied(false);}}} className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-teal-700"><Icon name="copy" width={14} height={14}/>{copied?c.copied:c.copy}</button></div></section>}
    </> : <section className="grid min-h-[400px] place-items-center rounded-[24px] border border-slate-200 bg-white p-8 text-center"><div className="max-w-md"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-slate-50 text-teal-700"><Icon name={room.state==="closed"?"check":room.platform==="undecided"?"video":"clock"} width={28} height={28}/></div><p className="mt-6 text-xs font-bold uppercase tracking-widest text-slate-400">{room.platform==="undecided"?c.noRoom:labels[room.platform]}</p><h2 className="mt-3 text-2xl font-bold text-teal-950">{room.state==="closed"?c.closed:room.platform==="undecided"?c.pendingTitle:room.state==="pending"?c.pendingConfirm:c.opens}</h2><p className="mt-3 text-sm leading-6 text-slate-500">{room.platform==="undecided"&&room.state!=="closed"?c.pendingText:startLabel}</p>{room.platform==="undecided"&&room.state!=="closed"&&<p className="mt-3 text-xs text-slate-400">{startLabel}</p>}</div></section>}
    {!isTutor && room.state==="open" && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start gap-2 text-slate-500"><Icon name="alert" width={17} height={17} className="mt-0.5 shrink-0"/><p className="max-w-xl text-xs leading-5">{room.issueReported?c.issueSent:c.reportIssue}</p></div><button disabled={issuePending||room.issueReported} onClick={report} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-slate-50 disabled:opacity-40"><Icon name="swap" width={15} height={15}/>{issuePending?"…":c.requestSwitch}</button></div>}
    <p className="text-xs leading-5 text-slate-400">{c.switchRules}</p>
  </div>;
}
