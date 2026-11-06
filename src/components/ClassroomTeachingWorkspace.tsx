"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClassroomMaterial } from "@/lib/classroom-material";
import { decodeMaterial } from "@/lib/material-content";
import PdfReader from "./PdfReader";

type Book = ClassroomMaterial;
type Point = { x: number; y: number };
type Stroke = { color: string; points: Point[]; width?: number };
type WorkspaceState = { bookId: number | null; page: number; unitIndex: number; audioTime: number; audioPlaying: boolean; question: string; answer: string; feedback: string; boardStrokes: Stroke[] };
const blank: WorkspaceState = { bookId: null, page: 1, unitIndex: 0, audioTime: 0, audioPlaying: false, question: "", answer: "", feedback: "", boardStrokes: [] };
const kindLabel = (kind: string) => kind === "audio" ? "Audio course" : kind === "worksheet" ? "Interactive worksheet" : "Textbook";
const smallButton = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40";

export default function ClassroomTeachingWorkspace({ lessonId, books, isTutor, userId, initialTab = "book" }: { lessonId: number; books: Book[]; isTutor: boolean; userId: number; initialTab?: "book" | "board" | "practice" }) {
  const [state, setState] = useState<WorkspaceState>({ ...blank });
  const [remoteSelectedBook, setRemoteSelectedBook] = useState<Book | null>(null);
  const [tab, setTab] = useState(initialTab);
  const [boardTool, setBoardTool] = useState<"pen" | "marker" | "eraser">("pen");
  const [boardColor, setBoardColor] = useState("#0f766e");
  const [syncStatus, setSyncStatus] = useState("Connecting to shared classroom…");
  const [pageDraft, setPageDraft] = useState("1");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryKind, setLibraryKind] = useState("all");
  const [conflict, setConflict] = useState(false);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [audioNotice, setAudioNotice] = useState("");
  const [saveNonce, setSaveNonce] = useState(0);
  const revision = useRef(0); const dirty = useRef(false); const conflicted = useRef(false); const initialized = useRef(false); const saving = useRef(false); const editVersion = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null); const audioRef = useRef<HTMLAudioElement>(null);
  const drawing = useRef(false); const activeStroke = useRef<Point[]>([]); const lastAudioSync = useRef(0); const stateRef = useRef(state); stateRef.current = state;
  const book = books.find(item => item.id === state.bookId) || (remoteSelectedBook?.id === state.bookId ? remoteSelectedBook : null);
  const decoded = book ? decodeMaterial(book) : null;
  const unit = decoded?.units[Math.min(state.unitIndex, decoded.units.length - 1)];
  const maxPage = pdfPageCount || decoded?.pageCount || 10000;
  const visibleBooks = isTutor ? books : book ? [book] : [];
  const filteredBooks = visibleBooks.filter(item => {
    const query = libraryQuery.trim().toLocaleLowerCase();
    return (libraryKind === "all" || item.kind === libraryKind) && (!query || `${item.title} ${item.category} ${item.language} ${item.level} ${item.description || ""}`.toLocaleLowerCase().includes(query));
  });
  const pdfUrl = book && decoded?.pdfRef ? `/api/private-files/material/${book.id}/asset?lesson=${lessonId}&asset=pdf` : "";
  const audioUrl = book && unit?.audioRef ? `/api/private-files/material/${book.id}/asset?lesson=${lessonId}&unit=${state.unitIndex}&type=audio` : "";
  const update = useCallback((patch: Partial<WorkspaceState>) => { editVersion.current++; dirty.current = true; setState(previous => ({ ...previous, ...patch })); }, []);
  useEffect(() => { setPageDraft(String(state.page)); }, [state.page]);
  useEffect(() => { setPdfPageCount(null); setAudioNotice(""); }, [state.bookId, state.unitIndex]);

  useEffect(() => {
    if (isTutor || !state.bookId || books.some(item => item.id === state.bookId)) { setRemoteSelectedBook(null); return; }
    let alive = true;
    void fetch(`/api/lessons/${lessonId}/teaching-material`, { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("material");
      return (await response.json()) as { material?: Book | null };
    }).then(payload => { if (alive) setRemoteSelectedBook(payload.material?.id === state.bookId ? payload.material : null); }).catch(() => { if (alive) setRemoteSelectedBook(null); });
    return () => { alive = false; };
  }, [lessonId, isTutor, state.bookId, books]);

  const acceptRemote = useCallback((remote: Partial<WorkspaceState>, nextRevision: number) => {
    const remoteBookId = Number(remote.bookId);
    const bookId = remote.bookId == null ? null : Number.isSafeInteger(remoteBookId) && remoteBookId > 0 ? remoteBookId : null;
    revision.current = nextRevision;
    setState({ ...blank, ...remote, bookId, boardStrokes: Array.isArray(remote.boardStrokes) ? remote.boardStrokes : [] });
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/lessons/${lessonId}/workspace`, { cache: "no-store" });
        if (!response.ok) throw new Error("sync");
        const payload = await response.json() as { state?: Partial<WorkspaceState>; revision?: number; updatedBy?: number | null };
        if (!alive) return;
        const nextRevision = Number.isSafeInteger(payload.revision) ? payload.revision! : 0;
        if (!initialized.current) {
          // A user may select a resource before the first GET returns. Keep that local edit.
          if (!dirty.current) acceptRemote(payload.state || {}, nextRevision);
          else { revision.current = nextRevision; setSaveNonce(value => value + 1); }
          initialized.current = true;
        } else if (nextRevision > revision.current && !dirty.current && !saving.current && !conflicted.current) {
          acceptRemote(payload.state || {}, nextRevision);
        }
        // Do not advance the expected revision while local edits are pending; that would
        // silently overwrite another participant's newer state on the next save.
        setSyncStatus(conflicted.current ? "A newer shared version is available" : dirty.current ? "Saving your changes…" : "Shared classroom connected · auto-saving");
      } catch { if (alive) setSyncStatus("Reconnecting…"); }
    };
    void poll(); const timer = window.setInterval(() => void poll(), 1800);
    const visible = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", visible);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [lessonId, acceptRemote]);

  useEffect(() => {
    if (!initialized.current || !dirty.current || conflicted.current) return;
    const timer = window.setTimeout(async () => {
      if (saving.current || conflicted.current || !dirty.current) return;
      saving.current = true;
      const version = editVersion.current;
      try {
        const response = await fetch(`/api/lessons/${lessonId}/workspace`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...stateRef.current, expectedRevision: revision.current }) });
        if (response.status === 409) { conflicted.current = true; setConflict(true); setSyncStatus("A participant saved a newer version. Your local changes were not overwritten."); return; }
        if (!response.ok) { setSyncStatus(response.status === 403 ? "Selected book is unavailable" : "Save failed · retry on next change"); return; }
        const payload = await response.json() as { revision?: number };
        if (Number.isSafeInteger(payload.revision)) revision.current = payload.revision!;
        if (editVersion.current === version) dirty.current = false;
        else setSaveNonce(value => value + 1);
        setSyncStatus("Shared classroom connected · saved");
      } catch { setSyncStatus("Offline · changes kept locally"); }
      finally { saving.current = false; }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [lessonId, state, saveNonce]);

  const syncLatest = async () => {
    try {
      const response = await fetch(`/api/lessons/${lessonId}/workspace`, { cache: "no-store" });
      if (!response.ok) throw new Error("sync");
      const payload = await response.json() as { state?: Partial<WorkspaceState>; revision?: number };
      acceptRemote(payload.state || {}, payload.revision ?? 0);
      dirty.current = false; conflicted.current = false; setConflict(false);
      setSyncStatus("Latest classroom version loaded");
    } catch { setSyncStatus("Could not load the latest classroom version"); }
  };

  useEffect(() => {
    const canvas = canvasRef.current; const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height); context.lineCap = "round"; context.lineJoin = "round";
    for (const stroke of state.boardStrokes) {
      if (!stroke.points?.length) continue;
      context.strokeStyle = stroke.color || "#0f766e"; context.lineWidth = stroke.width || 3;
      context.beginPath(); stroke.points.forEach((point, index) => { const x = point.x * canvas.width, y = point.y * canvas.height; if (!index) context.moveTo(x, y); else context.lineTo(x, y); }); context.stroke();
    }
  }, [state.boardStrokes, tab]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (Math.abs(audio.currentTime - state.audioTime) > 1.5) audio.currentTime = state.audioTime;
    if (state.audioPlaying && audio.paused) {
      if (!isTutor && !audioUnlocked) { setAudioNotice("Click Enable shared audio once to follow your teacher's playback."); return; }
      void audio.play().catch(() => setAudioNotice("Audio playback was blocked. Click Enable shared audio and try again."));
    }
    if (!state.audioPlaying && !audio.paused) audio.pause();
  }, [audioUrl, state.audioTime, state.audioPlaying, audioUnlocked, isTutor]);
  const enableAudio = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try { await audio.play(); setAudioUnlocked(true); setAudioNotice(""); if (!stateRef.current.audioPlaying) audio.pause(); }
    catch { setAudioNotice("The audio file could not play. Check the uploaded track or try another browser."); }
  };
  const chooseBook = (id: number) => { if (isTutor) { update({ bookId: id || null, page: 1, unitIndex: 0, audioTime: 0, audioPlaying: false }); setLibraryQuery(""); } };
  const point = (event: React.PointerEvent<HTMLCanvasElement>): Point => { const rect = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) }; };
  const strokeStyle = () => ({ color: boardTool === "eraser" ? "#ffffff" : boardTool === "marker" ? "rgba(250, 204, 21, 0.34)" : boardColor, width: boardTool === "eraser" ? 24 : boardTool === "marker" ? 15 : 3.5 });
  const startDraw = (event: React.PointerEvent<HTMLCanvasElement>) => { drawing.current = true; activeStroke.current = [point(event)]; event.currentTarget.setPointerCapture(event.pointerId); };
  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const canvas = event.currentTarget, context = canvas.getContext("2d"), next = point(event), previous = activeStroke.current.at(-1);
    if (previous && context) { const style = strokeStyle(); context.strokeStyle = style.color; context.lineWidth = style.width; context.lineCap = "round"; context.lineJoin = "round"; context.beginPath(); context.moveTo(previous.x * canvas.width, previous.y * canvas.height); context.lineTo(next.x * canvas.width, next.y * canvas.height); context.stroke(); }
    activeStroke.current.push(next);
  };
  const stopDraw = () => { if (!drawing.current) return; drawing.current = false; const points = activeStroke.current; activeStroke.current = []; if (points.length) update({ boardStrokes: [...stateRef.current.boardStrokes, { ...strokeStyle(), points }].slice(-300) }); };

  return <section className="@container min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-[#0b2931] to-[#104047] px-4 py-4 text-white">
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-teal-200">LINGORAIN STUDIO · SESSION {lessonId}</p><h2 className="mt-1 text-base font-black">Interactive learning workspace</h2><p role="status" className="mt-1 break-words text-[10px] text-teal-100/80">{syncStatus}</p>{conflict && <button type="button" onClick={syncLatest} className="mt-2 rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-bold text-amber-950">Load latest shared version</button>}</div>
      <label className="w-full min-w-0 text-xs font-semibold @[620px]:w-auto @[620px]:max-w-72">Admin teaching library<select value={book?.id ?? ""} onChange={event => chooseBook(Number(event.target.value))} className="mt-1 block w-full rounded-lg bg-white px-3 py-2 text-slate-900" disabled={!books.length || !isTutor}><option value="">Choose a resource</option>{visibleBooks.map(item => <option key={item.id} value={item.id}>{kindLabel(item.kind)} · {item.title}</option>)}</select></label>
    </header>
    <nav className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50 p-3">{([["book", "📘 Textbook"], ["board", "✏️ Whiteboard"], ["practice", "📝 Practice"]] as const).map(([id, label]) => <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={`rounded-xl px-3 py-2 text-xs font-bold ${tab === id ? "bg-teal-800 text-white" : "bg-white text-slate-600 hover:bg-teal-50"}`}>{label}</button>)}</nav>

    {tab === "book" && <div className="space-y-3 border-b border-slate-100 bg-slate-50/70 p-3 sm:p-4">
      {isTutor ? <><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-black text-slate-800">Published materials from Admin</p><p className="mt-0.5 text-[10px] text-slate-500">Every published textbook, audio course and worksheet is available.</p></div><span className="rounded-full bg-teal-100 px-3 py-1 text-[10px] font-bold text-teal-900">{books.length} resources</span></div>
        <div className="grid gap-2 @[520px]:grid-cols-[minmax(0,1fr)_170px]"><input value={libraryQuery} onChange={event => setLibraryQuery(event.target.value)} placeholder="Search title, category, level…" aria-label="Search admin teaching materials" className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"/><select value={libraryKind} onChange={event => setLibraryKind(event.target.value)} aria-label="Filter material type" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"><option value="all">All types</option><option value="textbook">Textbooks</option><option value="audio">Audio courses</option><option value="worksheet">Worksheets</option></select></div>
        {filteredBooks.length ? <div className="grid gap-2 @[560px]:grid-cols-2">{filteredBooks.map(item => <button key={item.id} type="button" onClick={() => chooseBook(item.id)} aria-pressed={book?.id === item.id} className={`flex min-w-0 items-start gap-2 rounded-xl border p-3 text-left ${book?.id === item.id ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-300"}`}><span className="text-lg">{item.kind === "audio" ? "🎧" : item.kind === "worksheet" ? "📝" : "📘"}</span><span className="min-w-0 flex-1"><span className="block break-words text-xs font-bold text-slate-900">{item.title}</span><span className="mt-1 block text-[10px] text-teal-800">{kindLabel(item.kind)} · {item.level}</span><span className="mt-1 block truncate text-[10px] text-slate-500">{item.category.replaceAll("_", " ")} · {item.language}</span></span>{book?.id === item.id && <span className="text-xs font-black text-teal-700">✓</span>}</button>)}</div> : <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-slate-500">{books.length ? "No materials match this search." : "No published materials yet. Publish resources in Admin → Materials."}</p>}</> : <p className="text-xs font-semibold text-slate-600">📚 Teacher-selected lesson material · page and audio follow your teacher</p>}
    </div>}

    {tab === "book" && (!book ? <div className="p-8 text-center"><p className="text-sm font-bold text-slate-800">{isTutor ? "Choose a resource to start teaching" : "Waiting for your teacher to select a resource"}</p><p className="mt-2 text-xs leading-5 text-slate-500">The selection is shared automatically with this lesson.</p></div> : <div className="min-w-0 space-y-4 p-3 sm:p-4">
      <div className="rounded-xl border border-teal-100 bg-teal-50/70 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-teal-800">{kindLabel(book.kind)} · {book.category.replaceAll("_", " ")}</p><h3 className="mt-1 break-words text-sm font-black text-slate-900">{book.title}</h3><p className="mt-1 text-[10px] text-slate-600">{book.language} · {book.level}</p>{book.description && <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">{book.description}</p>}</div>
      {pdfUrl ? <><div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"><span className="text-xs font-bold text-slate-700">PDF reader</span><div className="flex flex-wrap items-center gap-2"><button type="button" disabled={!isTutor || state.page <= 1} className={smallButton} onClick={() => update({ page: Math.max(1, state.page - 1) })}>Previous</button><form className="flex items-center gap-1" onSubmit={event => { event.preventDefault(); const next = Number(pageDraft); if (Number.isSafeInteger(next) && next >= 1 && next <= maxPage) update({ page: next }); else setPageDraft(String(state.page)); }}><span className="text-xs text-slate-500">Page</span><input aria-label="PDF page number" type="number" min={1} max={maxPage} value={pageDraft} disabled={!isTutor} onChange={event => setPageDraft(event.target.value)} className="w-16 rounded-lg border bg-white px-2 py-1.5 text-center text-xs"/><span className="text-xs text-slate-500">/ {pdfPageCount || decoded?.pageCount || "?"}</span><button type="submit" disabled={!isTutor} className="rounded-lg bg-teal-800 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-40">Go</button></form><button type="button" disabled={!isTutor || state.page >= maxPage} className={smallButton} onClick={() => update({ page: state.page + 1 })}>Next</button></div></div><PdfReader key={book.id} src={pdfUrl} page={state.page} title={book.title} onPageCount={count => { setPdfPageCount(count); if (isTutor && stateRef.current.page > count) update({ page: count }); }}/></> : <div className="rounded-xl border border-dashed border-teal-200 bg-teal-50/40 p-4 text-xs leading-6 text-slate-600">{decoded?.pdfIssue || (book.kind === "audio" ? "This audio course uses the lesson tracks below." : book.kind === "worksheet" ? "This worksheet uses the activities and text below." : "No PDF is attached. Use the lesson text and audio below, or ask an administrator to attach a PDF.")}</div>}
      {unit && <div className="min-w-0 rounded-xl border border-slate-200 p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Lesson {state.unitIndex + 1} of {decoded?.units.length}</p><h3 className="mt-1 break-words font-bold text-slate-900">{unit.title}</h3></div><div className="flex flex-wrap gap-2"><button type="button" disabled={!isTutor || state.unitIndex <= 0} onClick={() => update({ unitIndex: state.unitIndex - 1, audioTime: 0, audioPlaying: false })} className={smallButton}>Previous lesson</button><button type="button" disabled={!isTutor || state.unitIndex >= (decoded?.units.length || 1) - 1} onClick={() => update({ unitIndex: state.unitIndex + 1, audioTime: 0, audioPlaying: false })} className={smallButton}>Next lesson</button></div></div>
        {unit.imageRef && <img src={`/api/private-files/material/${book.id}/asset?lesson=${lessonId}&unit=${state.unitIndex}&type=image`} alt={`${unit.title} illustration`} loading="lazy" className="mt-3 max-h-72 w-full rounded-xl bg-slate-50 object-contain"/>}<p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{unit.content}</p>
        {audioUrl && <div className="mt-3 rounded-xl bg-slate-50 p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-teal-800">Shared lesson audio</p><audio ref={audioRef} key={audioUrl} controls={isTutor} preload="metadata" controlsList="nodownload" src={audioUrl} className="w-full" onPlay={event => { if (isTutor) update({ audioPlaying: true, audioTime: event.currentTarget.currentTime }); }} onPause={event => { if (isTutor) update({ audioPlaying: false, audioTime: event.currentTarget.currentTime }); }} onSeeked={event => { if (isTutor) update({ audioTime: event.currentTarget.currentTime }); }} onTimeUpdate={event => { if (isTutor && !event.currentTarget.paused && event.currentTarget.currentTime - lastAudioSync.current >= 2) { lastAudioSync.current = event.currentTarget.currentTime; update({ audioTime: event.currentTarget.currentTime }); } }}/>{!isTutor && <button type="button" onClick={enableAudio} className="mt-2 rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white">{audioUnlocked ? "Shared audio enabled ✓" : "Enable shared audio"}</button>}<p role="status" className="mt-2 text-[10px] leading-5 text-slate-500">{audioNotice || (isTutor ? "Play, pause or seek to synchronize audio with the student." : "Playback position follows your teacher after audio is enabled.")}</p></div>}
      </div>}
      <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-bold text-teal-900">Teaching controls & lesson tracks</summary><div className="mt-3 space-y-3"><p className="text-xs leading-5 text-slate-500">{isTutor ? "Guide the PDF page and audio track. Students follow the shared selection." : "Your teacher controls the selected resource, page and playback."}</p><label className="block text-xs font-bold text-slate-700">Lesson / audio track<select value={state.unitIndex} disabled={!isTutor} onChange={event => update({ unitIndex: Number(event.target.value), audioTime: 0, audioPlaying: false })} className="mt-2 w-full rounded-lg border bg-white p-2 text-sm">{(decoded?.units || []).map((item, index) => <option value={index} key={index}>{index + 1}. {item.title}</option>)}</select></label><ul className="list-disc space-y-1 pl-4 text-xs leading-5 text-slate-500"><li>Read aloud and clarify new words.</li><li>Replay audio for pronunciation.</li><li>Use the whiteboard for corrections.</li></ul></div></details>
    </div>)}

    {tab === "board" && <div className="min-w-0 space-y-3 p-3 sm:p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black text-slate-900">Shared whiteboard</p><p className="mt-1 text-[11px] text-slate-500">Both participants can draw. Marks sync with this lesson.</p></div><div className="flex gap-2"><button type="button" disabled={!isTutor || !state.boardStrokes.length} onClick={() => update({ boardStrokes: state.boardStrokes.slice(0, -1) })} className={smallButton}>Undo</button><button type="button" disabled={!isTutor || !state.boardStrokes.length} onClick={() => update({ boardStrokes: [] })} className={`${smallButton} text-rose-700`}>Clear</button></div></div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3">{([["pen", "Pen"], ["marker", "Highlighter"], ["eraser", "Eraser"]] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={boardTool === id} onClick={() => setBoardTool(id)} className={`rounded-lg px-3 py-2 text-xs font-bold ${boardTool === id ? "bg-teal-800 text-white" : "border bg-white text-slate-600"}`}>{label}</button>)}{["#0f766e", "#2563eb", "#dc2626", "#7c3aed", "#111827"].map(color => <button key={color} type="button" aria-label={`Pen color ${color}`} aria-pressed={boardColor === color} onClick={() => { setBoardColor(color); setBoardTool("pen"); }} className={`h-7 w-7 rounded-full border-2 ${boardColor === color ? "border-slate-900" : "border-white"}`} style={{ backgroundColor: color }}/>)}</div>
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white"><canvas ref={canvasRef} width={1200} height={750} onPointerDown={startDraw} onPointerMove={draw} onPointerUp={stopDraw} onPointerCancel={stopDraw} className="absolute inset-0 h-full w-full touch-none" style={{ backgroundImage: "linear-gradient(rgba(15,118,110,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(15,118,110,.055) 1px, transparent 1px)", backgroundSize: "28px 28px" }}/></div><p className="text-[10px] text-slate-400">The board keeps its proportions on laptop and mobile. Teacher controls undo and clear.</p></div>}

    {tab === "practice" && <div className="grid gap-4 p-3 sm:p-4 @[640px]:grid-cols-2"><div className="min-w-0 space-y-4 rounded-2xl border p-4"><h3 className="font-black text-slate-900">Practice together</h3><label className="block text-xs font-bold text-slate-600">Teacher prompt<textarea value={state.question} readOnly={!isTutor} onChange={event => update({ question: event.target.value })} className="mt-2 min-h-28 w-full rounded-xl border p-3 text-sm"/></label><label className="block text-xs font-bold text-slate-600">{isTutor ? "Student answer" : "Your answer"}<textarea value={state.answer} onChange={event => update({ answer: event.target.value })} className="mt-2 min-h-36 w-full rounded-xl border p-3 text-sm"/></label></div><div className="min-w-0 space-y-3 rounded-2xl bg-teal-50 p-4">{isTutor ? <label className="block text-xs font-bold text-teal-950">Teacher feedback<textarea value={state.feedback} onChange={event => update({ feedback: event.target.value })} className="mt-2 min-h-36 w-full rounded-xl border border-teal-100 bg-white p-3 text-sm"/></label> : <><p className="text-xs font-bold text-teal-950">Teacher feedback</p><p className="whitespace-pre-wrap break-words text-sm leading-7 text-teal-900">{state.feedback || "Your teacher's feedback will appear here."}</p></>}<p className="text-[10px] text-teal-800">Prompt, answer and feedback are saved to the shared workspace.</p></div></div>}
  </section>;
}
