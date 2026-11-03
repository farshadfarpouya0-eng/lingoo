"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";

type CheckState = "idle" | "ok" | "error";

function permissionLabel(state: PermissionState) {
  return state === "granted" ? "Allowed" : state === "denied" ? "Blocked" : "Not requested";
}

export default function TeacherClassTest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shareVideoRef = useRef<HTMLVideoElement>(null);
  const demoCanvasRef = useRef<HTMLCanvasElement>(null);
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
  const [demoBook, setDemoBook] = useState("Everyday English · Unit 1");

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
            {demoTab === "materials" && <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Practice textbook<select value={demoBook} onChange={e=>setDemoBook(e.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs"><option>Everyday English · Unit 1</option><option>IELTS Speaking · Part 1</option><option>Kids English · Lesson 1</option></select></label><div className="rounded-xl bg-teal-50 p-3"><p className="text-xs font-bold text-teal-900">Selected lesson</p><p className="mt-2 text-xs text-teal-800">{demoBook}</p><button type="button" onClick={testSpeaker} className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-teal-800">Play sample audio</button></div></div>}
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
