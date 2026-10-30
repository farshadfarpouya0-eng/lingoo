"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Unit = { title: string; content: string; audioRef?: string; imageRef?: string };
type Book = { id: number; title: string; category?: string; level: string; fileUrl: string; description: string };
type Point = { x: number; y: number };
type Stroke = { color: string; points: Point[] };
type WorkspaceState = { bookId: number | null; page: number; unitIndex: number; audioTime: number; audioPlaying: boolean; question: string; answer: string; feedback: string; boardStrokes: Stroke[] };
const blank: WorkspaceState = { bookId: null, page: 1, unitIndex: 0, audioTime: 0, audioPlaying: false, question: "", answer: "", feedback: "", boardStrokes: [] };
function decodeBook(book: Book) { try { const p = JSON.parse(book.fileUrl); return { pdfRef: String(p.pdfRef || ""), units: Array.isArray(p.units) ? p.units as Unit[] : [] }; } catch { return { pdfRef: "", units: [] as Unit[] }; } }

export default function ClassroomTeachingWorkspace({ lessonId, books, isTutor, userId }: { lessonId: number; books: Book[]; isTutor: boolean; userId: number }) {
  const [state, setState] = useState<WorkspaceState>(() => ({ ...blank, bookId: books[0]?.id ?? null }));
  const [tab, setTab] = useState<"book" | "board" | "practice">("book");
  const [syncStatus, setSyncStatus] = useState("Connecting to shared classroom…");
  const revision = useRef(0); const dirty = useRef(false); const conflicted = useRef(false); const [conflict, setConflict] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null); const audioRef = useRef<HTMLAudioElement>(null);
  const drawing = useRef(false); const activeStroke = useRef<Point[]>([]); const lastAudioSync = useRef(0); const latest = useRef(""); const initialized = useRef(false); const suppressSave = useRef(false); const stateRef = useRef(state); stateRef.current = state;
  const book = books.find(b => b.id === state.bookId) || books[0]; const decoded = book ? decodeBook(book) : null; const unit = decoded?.units[state.unitIndex];
  const pdfUrl = book && decoded?.pdfRef ? `/api/private-files/material/${book.id}/asset?asset=pdf` : "";
  const audioUrl = book && unit?.audioRef ? `/api/private-files/material/${book.id}/asset?unit=${state.unitIndex}&type=audio` : "";
  const update = useCallback((patch: Partial<WorkspaceState>) => { dirty.current = true; setState(prev => ({ ...prev, ...patch })); }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/lessons/${lessonId}/workspace`, { cache: "no-store" }); if (!res.ok) throw new Error("sync");
        const payload = await res.json() as { state?: Partial<WorkspaceState>; revision?: number; updatedAt?: string | null; updatedBy?: number | null };
        if (!alive) return;
        if (Number.isSafeInteger(payload.revision) && (payload.revision ?? 0) > revision.current) revision.current = payload.revision ?? revision.current;
        if (payload.updatedAt && payload.updatedAt !== latest.current && !dirty.current && (!initialized.current || payload.updatedBy !== userId)) {
          const remote = payload.state || {};
          suppressSave.current = true; latest.current = payload.updatedAt;
          setState(prev => ({ ...prev, ...remote, bookId: books.some(b => b.id === Number(remote.bookId)) ? Number(remote.bookId) : prev.bookId, boardStrokes: Array.isArray(remote.boardStrokes) ? remote.boardStrokes : prev.boardStrokes } as WorkspaceState));
          window.setTimeout(() => { suppressSave.current = false; }, 150);
        }
        initialized.current = true;
        setSyncStatus("Shared classroom connected · auto-saving");
      } catch { if (alive) setSyncStatus("Reconnecting…"); }
    };
    void poll(); const timer = window.setInterval(() => void poll(), 1800);
    return () => { alive = false; window.clearInterval(timer); };
  }, [lessonId, userId, books]);

  useEffect(() => {
    if (suppressSave.current) return;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/lessons/${lessonId}/workspace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...state, expectedRevision: revision.current }) });
        if (res.status === 409) { conflicted.current = true; setConflict(true); setSyncStatus("A participant saved a newer version. Your state was not written over it."); return; }
        if (!res.ok) { setSyncStatus(res.status === 403 ? "A selected book is not available to all participants" : "Save failed · retry on next change"); return; }
        const payload = await res.json() as { updatedAt?: string; revision?: number }; if (payload.updatedAt) latest.current = payload.updatedAt; if (Number.isSafeInteger(payload.revision)) revision.current = payload.revision!; dirty.current = false;
        setSyncStatus("Shared classroom connected · saved");
      } catch { setSyncStatus("Offline · waiting to reconnect"); }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [lessonId, state]);

  const syncLatest = async () => {
    try {
      const res = await fetch(`/api/lessons/${lessonId}/workspace`, { cache: "no-store" });
      if (!res.ok) throw new Error("sync");
      const payload = await res.json() as { state?: Partial<WorkspaceState>; revision?: number; updatedAt?: string | null };
      suppressSave.current = true; dirty.current = false; conflicted.current = false; setConflict(false);
      revision.current = payload.revision ?? 0; latest.current = payload.updatedAt || "";
      const remote = payload.state || {};
      setState({ ...blank, ...remote, bookId: books.some(b => b.id === Number(remote.bookId)) ? Number(remote.bookId) : books[0]?.id ?? null, boardStrokes: Array.isArray(remote.boardStrokes) ? remote.boardStrokes : [] } as WorkspaceState);
      window.setTimeout(() => { suppressSave.current = false; }, 200);
      setSyncStatus("Latest classroom version loaded");
    } catch { setSyncStatus("Could not load the latest classroom version"); }
  };

  useEffect(() => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const stroke of state.boardStrokes) { if (!stroke.points?.length) continue; ctx.strokeStyle = stroke.color || "#0f766e"; ctx.beginPath(); stroke.points.forEach((p,i) => { const x=p.x*canvas.width,y=p.y*canvas.height; if (!i) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke(); }
  }, [state.boardStrokes, tab]);

  useEffect(() => {
    const audio = audioRef.current; if (!audio || !audioUrl) return;
    if (Math.abs(audio.currentTime - state.audioTime) > 2) audio.currentTime = state.audioTime;
    if (state.audioPlaying && audio.paused) void audio.play().catch(() => {});
    if (!state.audioPlaying && !audio.paused) audio.pause();
  }, [audioUrl, state.audioTime, state.audioPlaying]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => { const r=e.currentTarget.getBoundingClientRect(); return { x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)), y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)) }; };
  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => { drawing.current=true; activeStroke.current=[point(e)]; e.currentTarget.setPointerCapture(e.pointerId); };
  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const c=e.currentTarget,ctx=c.getContext("2d"),p=point(e),prev=activeStroke.current.at(-1); if(prev&&ctx){ctx.strokeStyle="#0f766e";ctx.lineWidth=3;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(prev.x*c.width,prev.y*c.height);ctx.lineTo(p.x*c.width,p.y*c.height);ctx.stroke();} activeStroke.current.push(p); };
  const stopDraw = () => { if(!drawing.current)return; drawing.current=false; const points=activeStroke.current; activeStroke.current=[]; if(points.length) update({boardStrokes:[...stateRef.current.boardStrokes,{color:"#0f766e",points}].slice(-200)}); };

  return <section className="overflow-hidden rounded-3xl border border-teal-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-100 bg-teal-950 px-5 py-4 text-white"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-teal-200">Lingorain Teaching Studio · Session {lessonId}</p><h2 className="mt-1 text-lg font-black">Interactive textbook classroom</h2><p className="mt-1 text-[10px] text-teal-200">{syncStatus}</p>{conflict&&<button type="button" onClick={syncLatest} className="mt-2 rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-bold text-amber-950">Load latest shared version</button>}</div><label className="text-xs font-semibold">Book <select value={book?.id ?? ""} onChange={e=>{const id=Number(e.target.value);update({bookId:id||null,page:1,unitIndex:0,audioTime:0,audioPlaying:false});}} className="ml-2 max-w-56 rounded-lg bg-white px-3 py-2 text-slate-900" disabled={!books.length}><option value="">No textbook available</option>{books.map(b=><option key={b.id} value={b.id}>{b.title} · {(b.category || "general").replaceAll("_", " ")} · {b.level}</option>)}</select></label></header>
    <nav className="flex gap-2 border-b border-slate-100 p-3">{([ ["book","📘 Textbook"],["board","✏️ Whiteboard"],["practice","📝 Practice"]] as const).map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab===id?"bg-teal-800 text-white":"bg-slate-100 text-slate-600"}`}>{label}</button>)}</nav>
    {!book ? <div className="p-8 text-center text-sm text-slate-500">No accessible published textbooks are available for this account yet.</div> : <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="min-w-0">
      {tab === "book" && <div className="space-y-3">{pdfUrl ? <><div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"><span className="text-xs font-bold text-slate-700">{book.title} · PDF reader</span><div className="flex items-center gap-2"><button className="rounded-lg border px-3 py-1.5 text-xs" onClick={()=>update({page:Math.max(1,state.page-1)})}>Previous page</button><span className="text-xs font-bold">Page {state.page}</span><button className="rounded-lg border px-3 py-1.5 text-xs" onClick={()=>update({page:state.page+1})}>Next page</button></div></div><iframe title={`${book.title} PDF`} src={`${pdfUrl}#page=${state.page}&toolbar=0`} className="h-[65vh] min-h-[440px] w-full rounded-xl border border-slate-200 bg-slate-100" /></> : <div className="rounded-xl border border-dashed p-6 text-sm text-slate-500">This book has no PDF uploaded. Use the lesson text and audio below, or upload a PDF in Admin → Materials.</div>}
      {unit&&<div className="rounded-xl border border-slate-200 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Lesson {state.unitIndex+1} of {decoded?.units.length}</p><h3 className="mt-1 font-bold text-slate-900">{unit.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{unit.content}</p>{audioUrl&&<audio ref={audioRef} key={audioUrl} controls controlsList="nodownload" src={audioUrl} className="mt-3 w-full" onPlay={e=>update({audioPlaying:true,audioTime:e.currentTarget.currentTime})} onPause={e=>update({audioPlaying:false,audioTime:e.currentTarget.currentTime})} onSeeked={e=>update({audioTime:e.currentTarget.currentTime})} onTimeUpdate={e=>{if(isTutor&&!e.currentTarget.paused&&e.currentTarget.currentTime-lastAudioSync.current>=3){lastAudioSync.current=e.currentTarget.currentTime;update({audioTime:e.currentTarget.currentTime});}}} />}</div>}</div>}
      {tab === "board"&&<div className="space-y-2"><div className="flex items-center justify-between"><p className="text-sm font-bold">Shared class whiteboard</p><button className="rounded-lg border px-3 py-1.5 text-xs" onClick={()=>update({boardStrokes:[]})}>Clear board</button></div><canvas ref={canvasRef} width={1200} height={650} onPointerDown={startDraw} onPointerMove={draw} onPointerUp={stopDraw} onPointerCancel={stopDraw} className="h-[60vh] min-h-[400px] w-full touch-none rounded-xl border border-slate-200 bg-white"/><p className="text-xs text-slate-500">Drawings are saved and synchronized by polling. For best results, have one participant draw at a time.</p></div>}
      {tab === "practice"&&<div className="space-y-4 rounded-xl border border-slate-200 p-5"><h3 className="font-bold">Shared speaking / writing practice</h3><label className="block text-xs font-bold text-slate-600">Teacher question or prompt<textarea value={state.question} onChange={e=>update({question:e.target.value})} placeholder="e.g. Describe your daily routine using the present simple." className="mt-2 min-h-24 w-full rounded-xl border p-3 text-sm" /></label><label className="block text-xs font-bold text-slate-600">{isTutor?"Student answer":"Your answer"}<textarea value={state.answer} onChange={e=>update({answer:e.target.value})} placeholder="Type the answer here…" className="mt-2 min-h-32 w-full rounded-xl border p-3 text-sm" /></label>{isTutor&&<label className="block text-xs font-bold text-slate-600">Teacher feedback<textarea value={state.feedback} onChange={e=>update({feedback:e.target.value})} placeholder="Feedback and corrections" className="mt-2 min-h-20 w-full rounded-xl border p-3 text-sm" /></label>}<p className="text-xs text-teal-700">Prompt, answer and feedback are saved to the workspace for this lesson.</p></div>}
      </div><aside className="space-y-3"><div className="rounded-2xl bg-teal-50 p-4"><p className="text-xs font-bold text-teal-900">Teaching controls</p><p className="mt-1 text-xs leading-5 text-teal-800">{isTutor?"Guide the PDF page and audio track, annotate the shared board and review the student's answer.":"Follow the selected page and track, listen to the audio and work through the teacher's prompt."}</p></div><div className="rounded-2xl border p-4"><label className="block text-xs font-bold text-slate-700">Lesson / audio track<select value={state.unitIndex} onChange={e=>update({unitIndex:Number(e.target.value),audioTime:0,audioPlaying:false})} className="mt-2 w-full rounded-lg border bg-white p-2.5 text-sm">{(decoded?.units||[]).map((u,i)=><option value={i} key={i}>{i+1}. {u.title}</option>)}</select></label>{!decoded?.units.length&&<p className="mt-2 text-xs text-slate-500">No lesson units were added to this textbook.</p>}</div><div className="rounded-2xl border p-4"><p className="text-xs font-bold text-slate-700">Session tips</p><ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-5 text-slate-500"><li>Ask the student to read aloud.</li><li>Replay audio to practice pronunciation.</li><li>Use the whiteboard for corrections.</li><li>Finish with a short speaking prompt.</li></ul></div></aside></div>}
  </section>;
}
