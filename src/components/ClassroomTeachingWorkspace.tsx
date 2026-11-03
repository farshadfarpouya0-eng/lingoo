"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClassroomMaterial } from "@/lib/classroom-material";

type Unit = { title: string; content: string; audioRef?: string; imageRef?: string };
type Book = ClassroomMaterial;
type BookData = { pdfRef: string; pageCount: number | null; units: Unit[]; legacy: boolean };
type Point = { x: number; y: number };
type Stroke = { color: string; points: Point[]; width?: number };
type WorkspaceState = { bookId: number | null; page: number; unitIndex: number; audioTime: number; audioPlaying: boolean; question: string; answer: string; feedback: string; boardStrokes: Stroke[] };
const blank: WorkspaceState = { bookId: null, page: 1, unitIndex: 0, audioTime: 0, audioPlaying: false, question: "", answer: "", feedback: "", boardStrokes: [] };
function decodeBook(book: Book): BookData {
  const raw = (book.fileUrl || "").trim();
  try {
    const parsed = JSON.parse(raw) as { pdfRef?: unknown; pageCount?: unknown; units?: unknown; audioRef?: unknown };
    const units = Array.isArray(parsed.units) ? parsed.units.flatMap((entry): Unit[] => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      return [{
        title: typeof item.title === "string" && item.title.trim() ? item.title : "Lesson",
        content: typeof item.content === "string" ? item.content : "",
        audioRef: typeof item.audioRef === "string" ? item.audioRef : "",
        imageRef: typeof item.imageRef === "string" ? item.imageRef : "",
      }];
    }) : [];
    if (!units.length && typeof parsed.audioRef === "string" && parsed.audioRef) {
      units.push({ title: book.title, content: book.description || "", audioRef: parsed.audioRef });
    }
    const count = Number(parsed.pageCount);
    return {
      pdfRef: typeof parsed.pdfRef === "string" ? parsed.pdfRef : "",
      pageCount: Number.isSafeInteger(count) && count > 0 ? count : null,
      units: units.length ? units : [{ title: book.title, content: book.description || "" }],
      legacy: false,
    };
  } catch {
    // Support older Admin → Materials entries that stored one private file
    // reference directly instead of the newer structured course JSON.
    const ext = raw.split("/").pop()?.split("?")[0]?.split(".").pop()?.toLowerCase() || "";
    if (raw.startsWith("storage://") && ext === "pdf") {
      return { pdfRef: raw, pageCount: null, units: [{ title: book.title, content: book.description || "" }], legacy: true };
    }
    if (raw.startsWith("storage://") && ["mp3", "wav", "ogg", "m4a", "aac"].includes(ext)) {
      return { pdfRef: "", pageCount: null, units: [{ title: book.title, content: book.description || "", audioRef: raw }], legacy: true };
    }
    return { pdfRef: "", pageCount: null, units: [{ title: book.title, content: book.description || "" }], legacy: true };
  }
}

const materialKindLabel = (kind: string) => kind === "audio" ? "Audio course" : kind === "worksheet" ? "Interactive worksheet" : "Textbook";

export default function ClassroomTeachingWorkspace({ lessonId, books, isTutor, userId, initialTab = "book" }: { lessonId: number; books: Book[]; isTutor: boolean; userId: number; initialTab?: "book" | "board" | "practice" }) {
  const [state, setState] = useState<WorkspaceState>(() => ({ ...blank }));
  const [remoteSelectedBook, setRemoteSelectedBook] = useState<Book | null>(null);
  const [tab, setTab] = useState<"book" | "board" | "practice">(initialTab);
  const [boardTool, setBoardTool] = useState<"pen" | "marker" | "eraser">("pen");
  const [boardColor, setBoardColor] = useState("#0f766e");
  const [syncStatus, setSyncStatus] = useState("Connecting to shared classroom…");
  const [pageDraft, setPageDraft] = useState("1");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryKind, setLibraryKind] = useState("all");
  const revision = useRef(0); const dirty = useRef(false); const conflicted = useRef(false); const [conflict, setConflict] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null); const audioRef = useRef<HTMLAudioElement>(null);
  const drawing = useRef(false); const activeStroke = useRef<Point[]>([]); const lastAudioSync = useRef(0); const latest = useRef(""); const initialized = useRef(false); const suppressSave = useRef(false); const stateRef = useRef(state); stateRef.current = state;
  const book = books.find(b => b.id === state.bookId) || (remoteSelectedBook?.id === state.bookId ? remoteSelectedBook : null);
  const decoded = book ? decodeBook(book) : null; const unit = decoded?.units[state.unitIndex];
  // Students only receive the teacher's currently selected item. Tutors can
  // browse the complete published catalogue maintained in the Admin panel.
  const visibleBooks = isTutor ? books : book ? [book] : [];
  const filteredBooks = visibleBooks.filter(item => {
    const query = libraryQuery.trim().toLocaleLowerCase();
    const searchable = `${item.title} ${item.category || ""} ${item.language || ""} ${item.level} ${item.description || ""}`.toLocaleLowerCase();
    return (libraryKind === "all" || item.kind === libraryKind) && (!query || searchable.includes(query));
  });
  useEffect(() => { setPageDraft(String(state.page)); }, [state.page]);
  const pdfUrl = book && decoded?.pdfRef ? `/api/private-files/material/${book.id}/asset?lesson=${lessonId}&asset=pdf` : "";
  const audioUrl = book && unit?.audioRef ? `/api/private-files/material/${book.id}/asset?lesson=${lessonId}&unit=${state.unitIndex}&type=audio` : "";
  const update = useCallback((patch: Partial<WorkspaceState>) => { dirty.current = true; setState(prev => ({ ...prev, ...patch })); }, []);

  useEffect(() => {
    if (isTutor || !state.bookId || books.some(item => item.id === state.bookId)) {
      setRemoteSelectedBook(null);
      return;
    }
    let alive = true;
    const loadSelectedMaterial = async () => {
      try {
        const response = await fetch(`/api/lessons/${lessonId}/teaching-material`, { cache: "no-store" });
        if (!response.ok) throw new Error("material unavailable");
        const payload = await response.json() as { material?: Book | null };
        if (alive && payload.material?.id === state.bookId) setRemoteSelectedBook(payload.material);
        else if (alive) setRemoteSelectedBook(null);
      } catch {
        if (alive) setRemoteSelectedBook(null);
      }
    };
    void loadSelectedMaterial();
    return () => { alive = false; };
  }, [lessonId, isTutor, state.bookId, books]);

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
          const remoteBookId = Number(remote.bookId);
          const acceptedBookId = remote.bookId == null ? null : Number.isSafeInteger(remoteBookId) && remoteBookId > 0 && (!isTutor || books.some(item => item.id === remoteBookId)) ? remoteBookId : null;
          setState(prev => ({ ...prev, ...remote, bookId: acceptedBookId, boardStrokes: Array.isArray(remote.boardStrokes) ? remote.boardStrokes : prev.boardStrokes } as WorkspaceState));
          window.setTimeout(() => { suppressSave.current = false; }, 150);
        }
        initialized.current = true;
        setSyncStatus("Shared classroom connected · auto-saving");
      } catch { if (alive) setSyncStatus("Reconnecting…"); }
    };
    void poll(); const timer = window.setInterval(() => void poll(), 1800);
    return () => { alive = false; window.clearInterval(timer); };
  }, [lessonId, userId, books, isTutor]);

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
      const remoteBookId = Number(remote.bookId);
      const acceptedBookId = remote.bookId == null ? null : Number.isSafeInteger(remoteBookId) && remoteBookId > 0 && (!isTutor || books.some(item => item.id === remoteBookId)) ? remoteBookId : null;
      setState({ ...blank, ...remote, bookId: acceptedBookId, boardStrokes: Array.isArray(remote.boardStrokes) ? remote.boardStrokes : [] } as WorkspaceState);
      window.setTimeout(() => { suppressSave.current = false; }, 200);
      setSyncStatus("Latest classroom version loaded");
    } catch { setSyncStatus("Could not load the latest classroom version"); }
  };

  useEffect(() => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const stroke of state.boardStrokes) { if (!stroke.points?.length) continue; ctx.strokeStyle = stroke.color || "#0f766e"; ctx.lineWidth = stroke.width || 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); stroke.points.forEach((p,i) => { const x=p.x*canvas.width,y=p.y*canvas.height; if (!i) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke(); }
  }, [state.boardStrokes, tab]);

  useEffect(() => {
    const audio = audioRef.current; if (!audio || !audioUrl) return;
    if (Math.abs(audio.currentTime - state.audioTime) > 2) audio.currentTime = state.audioTime;
    if (state.audioPlaying && audio.paused) void audio.play().catch(() => {});
    if (!state.audioPlaying && !audio.paused) audio.pause();
  }, [audioUrl, state.audioTime, state.audioPlaying]);

  const chooseBook = (id: number) => {
    if (!isTutor) return;
    update({ bookId: id || null, page: 1, unitIndex: 0, audioTime: 0, audioPlaying: false });
    setLibraryQuery("");
  };

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => { const r=e.currentTarget.getBoundingClientRect(); return { x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)), y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)) }; };
  const currentStrokeStyle = () => ({
    color: boardTool === "eraser" ? "#ffffff" : boardTool === "marker" ? "rgba(250, 204, 21, 0.34)" : boardColor,
    width: boardTool === "eraser" ? 24 : boardTool === "marker" ? 15 : 3.5,
  });
  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    activeStroke.current = [point(e)];
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const c = e.currentTarget, ctx = c.getContext("2d"), p = point(e), prev = activeStroke.current.at(-1);
    if (prev && ctx) {
      const style = currentStrokeStyle();
      ctx.strokeStyle = style.color; ctx.lineWidth = style.width; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(prev.x * c.width, prev.y * c.height); ctx.lineTo(p.x * c.width, p.y * c.height); ctx.stroke();
    }
    activeStroke.current.push(p);
  };
  const stopDraw = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const points = activeStroke.current; activeStroke.current = [];
    if (points.length) {
      const style = currentStrokeStyle();
      update({ boardStrokes: [...stateRef.current.boardStrokes, { ...style, points }].slice(-300) });
    }
  };

  return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-900/20 bg-gradient-to-r from-[#0b2931] via-[#104047] to-[#0b2931] px-5 py-4 text-white">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[.18em] text-teal-200">LINGORAIN STUDIO · SESSION {lessonId}</p>
        <h2 className="mt-1 text-lg font-black">Interactive learning workspace</h2>
        <p className="mt-1 text-[10px] text-teal-100/80">{syncStatus}</p>
        {conflict && <button type="button" onClick={syncLatest} className="mt-2 rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-bold text-amber-950">Load latest shared version</button>}
      </div>
      <label className="text-xs font-semibold">Admin teaching library
        <select value={book?.id ?? ""} onChange={e => chooseBook(Number(e.target.value))} className="ml-2 max-w-56 rounded-lg bg-white px-3 py-2 text-slate-900" disabled={!books.length || !isTutor}>
          <option value="">Choose a resource</option>
          {visibleBooks.map(b => <option key={b.id} value={b.id}>{materialKindLabel(b.kind)} · {b.title}</option>)}
        </select>
      </label>
    </header>
    <nav className="flex flex-wrap gap-2 border-b border-slate-100 bg-slate-50/80 p-3">
      {([ ["book", "📘 Textbook"], ["board", "✏️ Whiteboard"], ["practice", "📝 Practice"] ] as const).map(([id, label]) =>
        <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={`rounded-xl px-4 py-2.5 text-xs font-bold transition ${tab === id ? "bg-teal-800 text-white shadow-sm" : "bg-white text-slate-600 hover:bg-teal-50 hover:text-teal-800"}`}>{label}</button>
      )}
    </nav>

    {tab === "book" && <div className="space-y-3 border-b border-slate-100 bg-slate-50/70 px-4 py-4">
      {isTutor ? <>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-slate-800">Published materials from Admin</p>
            <p className="mt-0.5 text-[10px] text-slate-500">All published textbooks, audio courses and worksheets are available here for teacher-led lessons.</p>
          </div>
          <span className="rounded-full bg-teal-100 px-3 py-1.5 text-[10px] font-bold text-teal-900">{books.length} resources</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_190px]">
          <input value={libraryQuery} onChange={e => setLibraryQuery(e.target.value)} placeholder="Search by title, category, level or language…" aria-label="Search admin teaching materials" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-teal-500" />
          <select value={libraryKind} onChange={e => setLibraryKind(e.target.value)} aria-label="Filter material type" className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700">
            <option value="all">All material types</option><option value="textbook">Textbooks</option><option value="audio">Audio courses</option><option value="worksheet">Worksheets</option>
          </select>
        </div>
        {filteredBooks.length ? <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filteredBooks.map(item => <button key={item.id} type="button" onClick={() => chooseBook(item.id)} aria-pressed={book?.id === item.id} className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 text-left transition ${book?.id === item.id ? "border-teal-500 bg-teal-50 ring-1 ring-teal-200" : "border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/50"}`}>
            {item.coverUrl?.startsWith("storage://") ? <img src={`/api/private-files/material/${item.id}/asset?lesson=${lessonId}&asset=cover`} alt="" loading="lazy" className="h-12 w-10 shrink-0 rounded-lg border border-slate-100 bg-slate-50 object-cover" /> : <span className="grid h-12 w-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-lg">{item.kind === "audio" ? "🎧" : item.kind === "worksheet" ? "📝" : "📘"}</span>}
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-900">{item.title}</span><span className="mt-1 block text-[10px] text-teal-800">{materialKindLabel(item.kind)}</span><span className="mt-1 block truncate text-[10px] text-slate-500">{(item.category || "general").replaceAll("_", " ")} · {item.language || "English"} · {item.level}</span></span>
            {book?.id === item.id && <span className="text-xs font-black text-teal-700">✓</span>}
          </button>)}
        </div> : <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-xs text-slate-500">{books.length ? "No materials match this search or filter." : "No published materials are available yet. Publish a textbook, audio course or worksheet in Admin → Materials."}</p>}
      </> : <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-100 text-lg">📚</span><div><p className="text-xs font-bold text-slate-800">Teacher-selected lesson material</p><p className="mt-0.5 text-[10px] text-slate-500">The selected resource and lesson progress are synchronized with your teacher.</p></div></div>}
    </div>}

    {tab === "book" && (!book ? <div className="p-10 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-2xl">📚</div><p className="mt-4 text-sm font-bold text-slate-800">{isTutor ? "Choose a resource to start teaching" : "Waiting for your teacher to select a resource"}</p><p className="mt-1 text-xs text-slate-500">{isTutor ? "Choose any published item from the Admin teaching library above." : "Your teacher can select a published textbook, audio course or worksheet from the admin library."}</p></div> : <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-teal-100 bg-teal-50/70 p-3">
          {book.coverUrl?.startsWith("storage://") && <img src={`/api/private-files/material/${book.id}/asset?lesson=${lessonId}&asset=cover`} alt="" className="h-16 w-12 shrink-0 rounded-lg border border-teal-100 bg-white object-cover" />}
          <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-teal-800">{materialKindLabel(book.kind)} · {(book.category || "general").replaceAll("_", " ")}</p><h3 className="mt-1 text-sm font-black text-slate-900">{book.title}</h3><p className="mt-1 text-[10px] text-slate-600">{book.language || "English"} · {book.level}</p>{book.description && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600">{book.description}</p>}</div>
        </div>
        {pdfUrl ? <>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3"><span className="text-xs font-bold text-slate-700">{book.title} · PDF reader</span><div className="flex flex-wrap items-center gap-2">
            <button disabled={!isTutor || state.page <= 1} className="rounded-lg border bg-white px-3 py-1.5 text-xs disabled:opacity-40" onClick={() => update({ page: Math.max(1, state.page - 1) })}>Previous</button>
            <form className="flex items-center gap-1" onSubmit={e => { e.preventDefault(); const n = Number(pageDraft); if (Number.isSafeInteger(n) && n >= 1 && (!decoded?.pageCount || n <= decoded.pageCount)) update({ page: n }); else setPageDraft(String(state.page)); }}>
              <span className="text-xs text-slate-500">Page</span><input aria-label="PDF page number" inputMode="numeric" type="number" min="1" max={decoded?.pageCount || 10000} value={pageDraft} disabled={!isTutor} onChange={e => setPageDraft(e.target.value)} onBlur={() => { const n = Number(pageDraft); if (!Number.isSafeInteger(n) || n < 1 || (decoded?.pageCount && n > decoded.pageCount)) setPageDraft(String(state.page)); }} className="w-16 rounded-lg border bg-white px-2 py-1.5 text-center text-xs" />
              <span className="text-xs text-slate-500">{decoded?.pageCount ? `/ ${decoded.pageCount}` : ""}</span><button type="submit" disabled={!isTutor} className="rounded-lg bg-teal-800 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-40">Go</button>
            </form>
            <button disabled={!isTutor || (!!decoded?.pageCount && state.page >= decoded.pageCount)} className="rounded-lg border bg-white px-3 py-1.5 text-xs disabled:opacity-40" onClick={() => update({ page: state.page + 1 })}>Next</button>
          </div></div>
          <iframe title={`${book.title} PDF`} src={`${pdfUrl}#page=${state.page}&toolbar=0`} className="h-[65vh] min-h-[440px] w-full rounded-xl border border-slate-200 bg-slate-100" />
        </> : <div className="rounded-xl border border-dashed border-teal-200 bg-teal-50/40 p-5 text-sm text-slate-600">{book.kind === "audio" ? "This audio course is taught through its lesson tracks below." : book.kind === "worksheet" ? "This worksheet is taught through its lesson activities and text below." : "No PDF file is attached to this resource. Use the lesson content and audio below."}</div>}
        {unit && <div className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Lesson {state.unitIndex + 1} of {decoded?.units.length}</p><h3 className="mt-1 font-bold text-slate-900">{unit.title}</h3></div><div className="flex gap-2"><button type="button" disabled={!isTutor || state.unitIndex <= 0} onClick={() => update({ unitIndex: state.unitIndex - 1, audioTime: 0, audioPlaying: false })} className="rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-40">Previous lesson</button><button type="button" disabled={!isTutor || state.unitIndex >= (decoded?.units.length || 1) - 1} onClick={() => update({ unitIndex: state.unitIndex + 1, audioTime: 0, audioPlaying: false })} className="rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-40">Next lesson</button></div></div>
          {unit.imageRef && <img src={`/api/private-files/material/${book.id}/asset?lesson=${lessonId}&unit=${state.unitIndex}&type=image`} alt={`${unit.title} lesson illustration`} loading="lazy" className="mt-3 max-h-72 w-full rounded-xl border border-slate-100 bg-slate-50 object-contain" />}
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{unit.content}</p>
          {audioUrl && <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-teal-800">Shared lesson audio</p><audio ref={audioRef} key={audioUrl} controls preload="metadata" controlsList="nodownload" src={audioUrl} className="w-full" onPlay={e => { if (isTutor) update({ audioPlaying: true, audioTime: e.currentTarget.currentTime }); }} onPause={e => { if (isTutor) update({ audioPlaying: false, audioTime: e.currentTarget.currentTime }); }} onSeeked={e => { if (isTutor) update({ audioTime: e.currentTarget.currentTime }); }} onTimeUpdate={e => { if (isTutor && !e.currentTarget.paused && e.currentTarget.currentTime - lastAudioSync.current >= 3) { lastAudioSync.current = e.currentTarget.currentTime; update({ audioTime: e.currentTarget.currentTime }); } }} /><p className="mt-2 text-[10px] leading-5 text-slate-500">{isTutor ? "Play, pause or seek to synchronize the audio position with the student." : "Use Play once to enable audio in your browser. The track follows your teacher's shared playback position."}</p></div>}
        </div>}
      </div>
      <aside className="space-y-3"><div className="rounded-2xl bg-teal-50 p-4"><p className="text-xs font-bold text-teal-900">Teaching controls</p><p className="mt-1 text-xs leading-5 text-teal-800">{isTutor ? "Guide the PDF page and audio track, annotate the shared board and review the student's answer." : "Follow the selected page and track, listen to the audio and work through the teacher's prompt."}</p></div><div className="rounded-2xl border p-4"><label className="block text-xs font-bold text-slate-700">Lesson / audio track<select value={state.unitIndex} disabled={!isTutor} onChange={e => update({ unitIndex: Number(e.target.value), audioTime: 0, audioPlaying: false })} className="mt-2 w-full rounded-lg border bg-white p-2.5 text-sm">{(decoded?.units || []).map((u, i) => <option value={i} key={i}>{i + 1}. {u.title}</option>)}</select></label>{!decoded?.units.length && <p className="mt-2 text-xs text-slate-500">No lesson units were added to this resource.</p>}</div><div className="rounded-2xl border p-4"><p className="text-xs font-bold text-slate-700">Session tips</p><ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-5 text-slate-500"><li>Ask the student to read aloud.</li><li>Replay audio to practice pronunciation.</li><li>Use the whiteboard for corrections.</li><li>Finish with a short speaking prompt.</li></ul></div></aside>
    </div>)}

    {tab === "board" && <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black text-slate-900">Shared whiteboard</p><p className="mt-1 text-[11px] text-slate-500">Both participants can draw. Changes are synchronized with this lesson.</p></div><div className="flex items-center gap-2"><button type="button" disabled={!isTutor || !state.boardStrokes.length} onClick={() => update({ boardStrokes: state.boardStrokes.slice(0, -1) })} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-40">Undo</button><button type="button" disabled={!isTutor || !state.boardStrokes.length} onClick={() => update({ boardStrokes: [] })} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-40">Clear board</button></div></div>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        {([ ["pen", "Pen"], ["marker", "Highlighter"], ["eraser", "Eraser"] ] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={boardTool === id} onClick={() => setBoardTool(id)} className={`rounded-lg px-3 py-2 text-xs font-bold ${boardTool === id ? "bg-teal-800 text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{label}</button>)}
        <span className="mx-1 h-6 w-px bg-slate-300" />
        {(["#0f766e", "#2563eb", "#dc2626", "#7c3aed", "#111827"] as const).map(color => <button key={color} type="button" aria-label={`Pen color ${color}`} aria-pressed={boardColor === color} onClick={() => { setBoardColor(color); setBoardTool("pen"); }} className={`h-7 w-7 rounded-full border-2 ${boardColor === color ? "border-slate-900 ring-2 ring-teal-200" : "border-white shadow"}`} style={{ backgroundColor: color }} />)}
        <span className="ml-auto text-[10px] font-medium text-slate-500">{isTutor ? "Teacher controls clear / undo" : "You can draw on the shared board"}</span>
      </div>
      <canvas ref={canvasRef} width={1200} height={650} onPointerDown={startDraw} onPointerMove={draw} onPointerUp={stopDraw} onPointerCancel={stopDraw} className="h-[62vh] min-h-[430px] w-full touch-none rounded-2xl border border-slate-200 bg-white shadow-inner" style={{ backgroundImage: "linear-gradient(rgba(15,118,110,.055) 1px, transparent 1px), linear-gradient(90deg, rgba(15,118,110,.055) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
      <p className="text-[10px] text-slate-400">Tip: use the highlighter for emphasis and the eraser to remove marks. The teacher can clear the board for a fresh activity.</p>
    </div>}

    {tab === "practice" && <div className="grid gap-4 p-4 lg:grid-cols-2"><div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><div><p className="text-[10px] font-bold uppercase tracking-widest text-teal-700">Speaking & writing</p><h3 className="mt-1 font-black text-slate-900">Practice together</h3></div><label className="block text-xs font-bold text-slate-600">Teacher question or prompt<textarea value={state.question} readOnly={!isTutor} onChange={e => update({ question: e.target.value })} placeholder="e.g. Describe your daily routine using the present simple." className="mt-2 min-h-28 w-full rounded-xl border p-3 text-sm" /></label><label className="block text-xs font-bold text-slate-600">{isTutor ? "Student answer" : "Your answer"}<textarea value={state.answer} onChange={e => update({ answer: e.target.value })} placeholder="Type the answer here…" className="mt-2 min-h-36 w-full rounded-xl border p-3 text-sm" /></label></div><div className="space-y-4 rounded-2xl bg-teal-50 p-5">{isTutor ? <label className="block text-xs font-bold text-teal-950">Teacher feedback<textarea value={state.feedback} onChange={e => update({ feedback: e.target.value })} placeholder="Feedback and corrections" className="mt-2 min-h-36 w-full rounded-xl border border-teal-100 bg-white p-3 text-sm" /></label> : <><p className="text-xs font-bold text-teal-950">Teacher feedback</p><p className="whitespace-pre-wrap text-sm leading-7 text-teal-900">{state.feedback || "Your teacher's feedback will appear here."}</p></>}<p className="text-[10px] text-teal-800">Prompt, answer and feedback are saved to the shared workspace for this lesson.</p></div></div>}
  </section>;
}
