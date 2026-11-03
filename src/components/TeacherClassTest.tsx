"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import type { ClassroomMaterial } from "@/lib/classroom-material";

type CheckState = "idle" | "ok" | "error";
type DemoUnit = { title: string; content: string; audioRef?: string; imageRef?: string };
type DemoMaterial = ClassroomMaterial;
type DemoMaterialContent = { pdfRef: string; pageCount: number | null; units: DemoUnit[] };

function decodeDemoMaterial(material: DemoMaterial): DemoMaterialContent {
  const raw = (material.fileUrl || "").trim();
  try {
    const parsed = JSON.parse(raw) as { pdfRef?: unknown; pageCount?: unknown; units?: unknown; audioRef?: unknown };
    const units: DemoUnit[] = Array.isArray(parsed.units) ? parsed.units.flatMap((value): DemoUnit[] => {
      if (!value || typeof value !== "object") return [];
      const unit = value as Record<string, unknown>;
      return [{
        title: typeof unit.title === "string" && unit.title.trim() ? unit.title : "Lesson",
        content: typeof unit.content === "string" ? unit.content : "",
        audioRef: typeof unit.audioRef === "string" ? unit.audioRef : "",
        imageRef: typeof unit.imageRef === "string" ? unit.imageRef : "",
      }];
    }) : [];
    if (!units.length && typeof parsed.audioRef === "string" && parsed.audioRef) units.push({ title: material.title, content: material.description || "", audioRef: parsed.audioRef });
    const count = Number(parsed.pageCount);
    return {
      pdfRef: typeof parsed.pdfRef === "string" ? parsed.pdfRef : "",
      pageCount: Number.isSafeInteger(count) && count > 0 ? count : null,
      units: units.length ? units : [{ title: material.title, content: material.description || "" }],
    };
  } catch {
    const extension = raw.split("/").pop()?.split("?")[0]?.split(".").pop()?.toLowerCase() || "";
    if (raw.startsWith("storage://") && extension === "pdf") return { pdfRef: raw, pageCount: null, units: [{ title: material.title, content: material.description || "" }] };
    if (raw.startsWith("storage://") && ["mp3", "wav", "ogg", "m4a", "aac"].includes(extension)) return { pdfRef: "", pageCount: null, units: [{ title: material.title, content: material.description || "", audioRef: raw }] };
    return { pdfRef: "", pageCount: null, units: [{ title: material.title, content: material.description || "" }] };
  }
}

const demoMaterialKind = (kind: string) => kind === "audio" ? "Audio course" : kind === "worksheet" ? "Interactive worksheet" : "Textbook";

function permissionLabel(state: PermissionState) {
  return state === "granted" ? "Allowed" : state === "denied" ? "Blocked" : "Not requested";
}

export default function TeacherClassTest({ materials }: { materials: DemoMaterial[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shareVideoRef = useRef<HTMLVideoElement>(null);
  const demoCanvasRef = useRef<HTMLCanvasElement>(null);
  const demoAudioRef = useRef<HTMLAudioElement>(null);
  const demoDrawingRef = useRef(false);
  const shareStreamRef = useRef<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const [camera, setCamera] = useState<CheckState>("idle");
  const [microphone, setMicrophone] = useState<CheckState>("idle");
  const [speaker, setSpeaker] = useState<CheckState>("idle");
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState("Checking permissions…");
  const [secureContext, setSecureContext] = useState(true);
  const [checks, setChecks] = useState({ internet: false, headphones: false, materials: false });
  const [demoTab, setDemoTab] = useState<"board" | "chat" | "materials">("board");
  const [demoChat, setDemoChat] = useState([{ from: "Student", text: "Could you explain this example again?" }]);
  const [demoMessage, setDemoMessage] = useState("");
  const [demoBoardColor, setDemoBoardColor] = useState("#0f766e");
  const [screenTest, setScreenTest] = useState(false);
  const [demoBookId, setDemoBookId] = useState<number | "">(() => materials[0]?.id ?? "");
  const [demoUnitIndex, setDemoUnitIndex] = useState(0);
  const [demoPage, setDemoPage] = useState(1);
  const demoBook = materials.find(material => material.id === demoBookId) || null;
  const demoContent = demoBook ? decodeDemoMaterial(demoBook) : null;
  const demoUnit = demoContent?.units[demoUnitIndex] || null;
  const demoPdfUrl = demoBook && demoContent?.pdfRef ? `/api/private-files/material/${demoBook.id}/preview?asset=pdf` : "";
  const demoAudioUrl = demoBook && demoUnit?.audioRef ? `/api/private-files/material/${demoBook.id}/preview?asset=audio&unit=${demoUnitIndex}` : "";
  const demoImageUrl = demoBook && demoUnit?.imageRef ? `/api/private-files/material/${demoBook.id}/preview?asset=image&unit=${demoUnitIndex}` : "";
  const demoCoverUrl = demoBook?.coverUrl?.startsWith("storage://") ? `/api/private-files/material/${demoBook.id}/preview?asset=cover` : "";

  useEffect(() => {
    setSecureContext(window.isSecureContext);
    let cancelled = false;
    const checkPermissions = async () => {
      try {
        if (!navigator.permissions?.query) {
          if (!cancelled) setPermissionStatus("This browser cannot report permission status directly. You will be prompted when you start the device check.");
          return;
        }
        const [cameraPermission, microphonePermission] = await Promise.all([
          navigator.permissions.query({ name: "camera" as PermissionName }),
          navigator.permissions.query({ name: "microphone" as PermissionName }),
        ]);
        if (!cancelled) setPermissionStatus(`Camera: ${permissionLabel(cameraPermission.state)} · Microphone: ${permissionLabel(microphonePermission.state)}`);
        const update = () => {
          if (!cancelled) setPermissionStatus(`Camera: ${permissionLabel(cameraPermission.state)} · Microphone: ${permissionLabel(microphonePermission.state)}`);
        };
        cameraPermission.addEventListener("change", update);
        microphonePermission.addEventListener("change", update);
      } catch {
        if (!cancelled) setPermissionStatus("Permission status is unavailable. Start the camera and microphone check to test access.");
      }
    };
    void checkPermissions();
    return () => { cancelled = true; };
  }, []);

  const stopTest = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    shareStreamRef.current?.getTracks().forEach(track => track.stop());
    shareStreamRef.current = null;
    if (shareVideoRef.current) shareVideoRef.current.srcObject = null;
    setScreenTest(false);
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    setTesting(false);
    setLevel(0);
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    shareStreamRef.current?.getTracks().forEach(track => track.stop());
    void audioContextRef.current?.close();
  }, []);

  const startTest = async () => {
    setError("");
    setCamera("idle");
    setMicrophone("idle");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Your browser or connection does not allow camera and microphone access. Use HTTPS and an up-to-date browser.");
        setCamera("error");
        setMicrophone("error");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCamera(stream.getVideoTracks().length ? "ok" : "error");
      setMicrophone(stream.getAudioTracks().length ? "ok" : "error");
      setTesting(true);

      const AudioContextClass = window.AudioContext;
      if (AudioContextClass && stream.getAudioTracks().length) {
        const context = new AudioContextClass();
        audioContextRef.current = context;
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;
        const samples = new Uint8Array(analyser.fftSize);
        const readLevel = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) {
            const centered = (sample - 128) / 128;
            sum += centered * centered;
          }
          setLevel(Math.min(100, Math.round(Math.sqrt(sum / samples.length) * 260)));
          frameRef.current = requestAnimationFrame(readLevel);
        };
        readLevel();
      }
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(name === "NotAllowedError"
        ? "Camera or microphone access was denied. Enable the permissions in your browser settings."
        : name === "NotFoundError"
          ? "No connected camera or microphone was found. Check your devices."
          : "The device check could not be completed. Check your connection and browser settings.");
      setCamera("error");
      setMicrophone("error");
      stopTest();
    }
  };

  const testSpeaker = async () => {
    try {
      const Context = window.AudioContext;
      if (!Context) throw new Error("unsupported");
      const context = new Context();
      await context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 440;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.56);
      setSpeaker("ok");
      window.setTimeout(() => void context.close(), 700);
    } catch {
      setSpeaker("error");
      setError("The test sound could not be played in this browser.");
    }
  };


  useEffect(() => {
    if (!screenTest || !shareVideoRef.current || !shareStreamRef.current) return;
    shareVideoRef.current.srcObject = shareStreamRef.current;
    void shareVideoRef.current.play().catch(() => undefined);
  }, [screenTest]);

  const startScreenShareTest = async () => {
    setError("");
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Screen sharing is not supported in this browser. Try a current desktop browser over HTTPS.");
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      shareStreamRef.current = stream;
      if (shareVideoRef.current) {
        shareVideoRef.current.srcObject = stream;
        await shareVideoRef.current.play().catch(() => undefined);
      }
      setScreenTest(true);
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        shareStreamRef.current?.getTracks().forEach(track => track.stop());
        shareStreamRef.current = null;
        if (shareVideoRef.current) shareVideoRef.current.srcObject = null;
        setScreenTest(false);
      }, { once: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(name === "NotAllowedError" ? "Screen sharing was cancelled or blocked. You can try again when ready." : err instanceof Error ? err.message : "Could not start the screen-share test.");
      setScreenTest(false);
    }
  };

  const stopScreenShareTest = () => {
    shareStreamRef.current?.getTracks().forEach(track => track.stop());
    shareStreamRef.current = null;
    if (shareVideoRef.current) shareVideoRef.current.srcObject = null;
    setScreenTest(false);
  };

  const demoPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width, y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height };
  };
  const startDemoDraw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const ctx = canvas.getContext("2d");
    const point = demoPoint(event);
    if (!ctx) return;
    demoDrawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    ctx.strokeStyle = demoBoardColor; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(point.x, point.y);
  };
  const drawDemo = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!demoDrawingRef.current) return;
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    const point = demoPoint(event);
    ctx.strokeStyle = demoBoardColor; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.lineTo(point.x, point.y); ctx.stroke();
  };
  const stopDemoDraw = () => { demoDrawingRef.current = false; };
  const clearDemoBoard = () => {
    const ctx = demoCanvasRef.current?.getContext("2d");
    if (ctx && demoCanvasRef.current) ctx.clearRect(0, 0, demoCanvasRef.current.width, demoCanvasRef.current.height);
  };

  const statusText = (state: CheckState) => state === "ok" ? "Ready" : state === "error" ? "Needs attention" : "Not tested";
  const statusClass = (state: CheckState) => state === "ok" ? "bg-emerald-50 text-emerald-700" : state === "error" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500";

  return (
    <div className="space-y-6" dir="ltr">
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-teal-700">Before Your First Session</p>
            <h2 className="mt-2 text-xl font-bold text-teal-950">LingoRoom Demo</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">Practice using LingoRoom before your first lesson. Check your camera, microphone, and speakers in a safe demo environment. No real lesson is created, and no student will join this room.</p>
          </div>
          <span className="rounded-xl bg-teal-50 p-3 text-teal-700"><Icon name="video" width={25} height={25} /></span>
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,.8fr)]">
          <div className="overflow-hidden rounded-2xl bg-slate-950">
            <div className="relative aspect-video">
              <video ref={videoRef} muted playsInline className={`h-full w-full object-cover ${testing && camera === "ok" ? "block" : "hidden"}`} />
              {(!testing || camera !== "ok") && <div className="absolute inset-0 grid place-items-center text-center text-slate-400"><div><Icon name="video" width={34} height={34} className="mx-auto mb-3 opacity-60"/><p className="text-sm">Your camera preview will appear when you start the device check.</p></div></div>}
              {testing && <span className="absolute bottom-3 right-3 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white">Preview visible only to you</span>}
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-bold text-teal-950"><Icon name="video" width={17}/> Camera</div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(camera)}`}>{statusText(camera)}</span></div>
              <p className="mt-2 text-xs leading-6 text-slate-500">Check your video in the preview.</p>
            </div>
            <div className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-bold text-teal-950"><Icon name="messages" width={17}/> Microphone</div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(microphone)}`}>{statusText(microphone)}</span></div>
              <p className="mt-2 text-xs text-slate-500">Speak and watch the audio level indicator.</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600 transition-[width]" style={{ width: `${level}%` }}/></div>
            </div>
            <div className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-bold text-teal-950"><Icon name="chart" width={17}/> Speakers</div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(speaker)}`}>{statusText(speaker)}</span></div>
              <button type="button" onClick={testSpeaker} className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">Play test sound</button>
              <p className="mt-2 text-[11px] text-slate-400">If you can hear the sound, your audio output is working.</p>
            </div>
          </div>
        </div>
        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <div><h3 className="text-sm font-bold text-teal-950">Practice Classroom</h3><p className="mt-1 text-[11px] text-slate-500">Try the teaching workflow with simulated content. Nothing is saved to a real lesson.</p></div>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800">Demo only</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 p-3">
            <div className="flex gap-1">
              {([{id:"board",label:"Whiteboard"},{id:"chat",label:"Class Chat"},{id:"materials",label:"Textbook & Audio"}] as const).map(tab => <button key={tab.id} type="button" onClick={() => setDemoTab(tab.id)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${demoTab===tab.id?"bg-white text-teal-800 shadow-sm":"text-slate-500 hover:bg-white"}`}>{tab.label}</button>)}
            </div>
            <div className="flex items-center gap-2">
              {!screenTest ? <button type="button" onClick={startScreenShareTest} className="rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white hover:bg-teal-900">Test screen share</button> : <button type="button" onClick={stopScreenShareTest} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white hover:bg-rose-700">Stop screen test</button>}
            </div>
          </div>
          {screenTest && <div className="border-b border-teal-100 bg-teal-50 p-3"><p className="mb-2 text-[11px] font-bold text-teal-900">Local screen-share preview · visible only to you in this demo</p><video ref={shareVideoRef} autoPlay playsInline muted className="max-h-64 w-full rounded-xl bg-slate-950 object-contain" /></div>}
          <div className="p-4">
            {demoTab === "board" && <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold text-slate-700">Interactive whiteboard</p><p className="mt-1 text-[11px] text-slate-400">Try drawing and changing the pen color. This demo board is local only.</p></div><div className="flex items-center gap-2">{(["#0f766e", "#2563eb", "#dc2626", "#7c3aed", "#111827"] as const).map(color => <button key={color} type="button" aria-label={`Pen color ${color}`} aria-pressed={demoBoardColor===color} onClick={() => setDemoBoardColor(color)} className={`h-7 w-7 rounded-full border-2 ${demoBoardColor===color?"border-slate-900 ring-2 ring-teal-200":"border-white shadow"}`} style={{backgroundColor:color}} />)}<button type="button" onClick={clearDemoBoard} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600">Clear</button></div></div>
              <canvas ref={demoCanvasRef} width={1100} height={500} onPointerDown={startDemoDraw} onPointerMove={drawDemo} onPointerUp={stopDemoDraw} onPointerCancel={stopDemoDraw} className="h-[42vh] min-h-[300px] w-full touch-none rounded-xl border border-slate-200 bg-white" style={{backgroundImage:"linear-gradient(rgba(15,118,110,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(15,118,110,.055) 1px, transparent 1px)",backgroundSize:"26px 26px"}} />
            </div>}
            {demoTab === "chat" && <div><div className="mb-3 max-h-36 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">{demoChat.map((m,i)=><div key={i} className="rounded-lg bg-white p-2.5 text-xs"><b className="text-teal-800">{m.from}</b><p className="mt-1 text-slate-600">{m.text}</p></div>)}</div><form onSubmit={e=>{e.preventDefault();const msg=demoMessage.trim();if(msg){setDemoChat(v=>[...v,{from:"You",text:msg}]);setDemoMessage("");}}} className="flex gap-2"><input value={demoMessage} onChange={e=>setDemoMessage(e.target.value)} maxLength={300} placeholder="Send a practice message…" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs"/><button className="rounded-lg bg-teal-800 px-4 py-2 text-xs font-bold text-white">Send</button></form></div>}
            {demoTab === "materials" && <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="min-w-0 flex-1 text-xs font-semibold text-slate-700">Admin teaching library
                  <select value={demoBookId} onChange={e => { setDemoBookId(e.target.value ? Number(e.target.value) : ""); setDemoUnitIndex(0); setDemoPage(1); }} className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs" disabled={!materials.length}>
                    <option value="">Choose a published resource</option>
                    {materials.map(material => <option key={material.id} value={material.id}>{demoMaterialKind(material.kind)} · {material.title}</option>)}
                  </select>
                </label>
                <span className="rounded-full bg-teal-100 px-3 py-2 text-[10px] font-bold text-teal-900">{materials.length} published resources</span>
              </div>
              {!materials.length ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center"><p className="text-sm font-bold text-slate-800">No published teaching materials yet</p><p className="mt-2 text-xs text-slate-500">Upload a textbook, audio course or worksheet in Admin → Materials, then mark it as Published.</p></div> : !demoBook || !demoContent || !demoUnit ? <div className="rounded-xl border border-dashed border-slate-300 px-5 py-8 text-center text-xs text-slate-500">Choose a resource from the admin library to preview and teach it in this practice room.</div> : <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
                <div className="flex flex-wrap items-start gap-3 rounded-xl bg-teal-50 p-3">
                  {demoCoverUrl && <img src={demoCoverUrl} alt="" className="h-16 w-12 shrink-0 rounded-lg border border-teal-100 bg-white object-cover" />}
                  <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-teal-800">{demoMaterialKind(demoBook.kind)} · {demoBook.category.replaceAll("_", " ")}</p><h4 className="mt-1 text-sm font-black text-slate-900">{demoBook.title}</h4><p className="mt-1 text-[10px] text-slate-500">{demoBook.language} · {demoBook.level}</p>{demoBook.description && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{demoBook.description}</p>}</div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold text-teal-800">Preview only</span>
                </div>
                {demoPdfUrl ? <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-slate-700">Textbook PDF</p><div className="flex items-center gap-2"><button type="button" disabled={demoPage <= 1} onClick={() => setDemoPage(value => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40">Previous</button><span className="text-[11px] text-slate-500">Page {demoPage}{demoContent.pageCount ? ` / ${demoContent.pageCount}` : ""}</span><button type="button" disabled={!!demoContent.pageCount && demoPage >= demoContent.pageCount} onClick={() => setDemoPage(value => value + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40">Next</button></div></div>
                  <iframe title={`${demoBook.title} PDF preview`} src={`${demoPdfUrl}#page=${demoPage}&toolbar=0`} className="h-[55vh] min-h-[340px] w-full rounded-xl border border-slate-200 bg-slate-100" />
                </div> : <div className="rounded-xl border border-dashed border-teal-200 bg-teal-50/50 p-4 text-xs text-slate-600">This resource is taught through its lesson text and media below.</div>}
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Lesson {demoUnitIndex + 1} of {demoContent.units.length}</p><h5 className="mt-1 text-sm font-bold text-slate-900">{demoUnit.title}</h5></div><label className="text-[10px] font-semibold text-slate-500">Choose lesson<select value={demoUnitIndex} onChange={e => setDemoUnitIndex(Number(e.target.value))} className="mt-1 block max-w-48 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs">{demoContent.units.map((unit, index) => <option key={`${index}-${unit.title}`} value={index}>{index + 1}. {unit.title}</option>)}</select></label></div>
                    {demoImageUrl && <img src={demoImageUrl} alt={`${demoUnit.title} illustration`} loading="lazy" className="max-h-64 w-full rounded-lg border border-slate-100 bg-slate-50 object-contain" />}
                    <p className="whitespace-pre-wrap text-xs leading-7 text-slate-700">{demoUnit.content || "No lesson text was added to this unit."}</p>
                    {demoAudioUrl && <div className="rounded-lg bg-slate-50 p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-teal-800">Lesson audio</p><audio ref={demoAudioRef} key={demoAudioUrl} controls preload="metadata" controlsList="nodownload" src={demoAudioUrl} className="w-full" /></div>}
                  </div>
                  <aside className="space-y-3 rounded-xl bg-teal-50 p-3"><p className="text-xs font-bold text-teal-950">Teaching ideas</p><ul className="list-disc space-y-2 pl-4 text-[11px] leading-5 text-teal-900"><li>Read the text together and clarify new words.</li><li>Play the audio and practice pronunciation.</li><li>Use the whiteboard to explain and annotate.</li><li>Ask the student to answer a question about this lesson.</li></ul><p className="rounded-lg bg-white/80 p-2 text-[10px] leading-5 text-teal-800">This preview uses real published Admin materials, but changes stay local to the demo and are not saved to a real lesson.</p></aside>
                </div>
              </div>}
            </div>}
          </div>
        </section>
        <section className="mt-5 rounded-2xl border border-slate-100 p-4">
          <h3 className="text-sm font-bold text-teal-950">Browser & Permissions</h3>
          <p className="mt-2 text-xs leading-6 text-slate-500">{permissionStatus}</p>
          <p className={`mt-2 text-xs font-semibold ${secureContext ? "text-emerald-700" : "text-amber-700"}`}>{secureContext ? "Secure browser connection is active." : "This site must be opened over HTTPS to access your camera and microphone."}</p>
        </section>
        <section className="mt-5 rounded-2xl border border-slate-100 p-4">
          <h3 className="text-sm font-bold text-teal-950">Pre-Class Readiness Checklist</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={checks.internet} onChange={e => setChecks(v => ({ ...v, internet: e.target.checked }))} className="accent-teal-700" /> Internet connection checked</label>
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={checks.headphones} onChange={e => setChecks(v => ({ ...v, headphones: e.target.checked }))} className="accent-teal-700" /> Headphones and a suitable environment are ready</label>
            <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={checks.materials} onChange={e => setChecks(v => ({ ...v, materials: e.target.checked }))} className="accent-teal-700" /> Lesson materials are ready</label>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">{Object.values(checks).filter(Boolean).length} of 3 checklist items completed</p>
        </section>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-xs leading-6 text-rose-700">{error}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!testing ? <button type="button" onClick={startTest} className="rounded-xl bg-teal-800 px-5 py-3 text-sm font-bold text-white hover:bg-teal-900">Start Camera & Microphone Check</button> : <button type="button" onClick={stopTest} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">Stop Check & Turn Off Camera</button>}
          <Link href="/dashboard?tab=lessons" className="rounded-xl border border-teal-200 px-5 py-3 text-sm font-bold text-teal-800 hover:bg-teal-50">View Scheduled Lessons</Link>
        </div>
      </section>
      <section className="rounded-[22px] border border-amber-100 bg-amber-50/70 p-5">
        <h3 className="text-sm font-bold text-amber-950">When It’s Time for Your Lesson</h3>
        <ol className="mt-3 space-y-2 text-xs leading-6 text-amber-950/80">
          <li>1. Find your confirmed lesson under “My Lessons.”</li>
          <li>2. When the room opens, select “Join Class.” This demo does not replace your actual lesson room.</li>
          <li>3. Inside LingoRoom, check your camera and microphone, then open the lesson book and whiteboard using the in-room tools.</li>
          <li>4. If LingoRoom is unavailable, use the backup option provided for your lesson.</li>
        </ol>
      </section>
    </div>
  );
}
