"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createMaterial } from "@/lib/feature-actions";

type CourseUnit = { title: string; content: string; audioUrl?: string; imageUrl?: string; audioRef?: string; imageRef?: string };

const input = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500";
type AssetTicket = { signedUrl?: string; reference?: string; contentType?: string; error?: string };

import { uploadMaterialAsset as uploadAsset } from "@/lib/material-upload-client";

export default function MaterialUploadForm() {
  const router = useRouter();
  const [kind, setKind] = useState<"textbook" | "audio" | "worksheet">("textbook");
  const [coverRef, setCoverRef] = useState("");
  const [pdfRef, setPdfRef] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [units, setUnits] = useState<CourseUnit[]>([{ title: "Lesson 1: Introduction & Dialogue", content: "", audioRef: "", imageRef: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [state, action, pending] = useActionState(async (_prev: unknown, fd: FormData) => {
    const r = await createMaterial(fd);
    if (r?.ok) {
      setUnits([{ title: "Lesson 1: Introduction & Dialogue", content: "", audioRef: "", imageRef: "" }]);
      setCoverRef(""); setPdfRef(""); setPageCount(0); router.refresh();
    }
    return r;
  }, null as { ok?: boolean; error?: string } | null);
  const payload = JSON.stringify({ pdfRef, pageCount: pageCount > 0 ? pageCount : null, units });
  const updateUnit = (idx: number, patch: Partial<CourseUnit>) => setUnits(prev => prev.map((u, i) => i === idx ? { ...u, ...patch } : u));
  const handleUpload = async (file: File | undefined, cb: (ref: string) => void, materialKind: "textbook" | "audio" | "worksheet") => {
    if (!file) return;
    setErr("");
    if (file.size > 25 * 1024 * 1024) { setErr(`File "${file.name}" exceeds the 25 MB limit.`); return; }
    setBusy(true);
    try { cb(await uploadAsset(file, materialKind)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not upload file."); }
    finally { setBusy(false); }
  };

  return <form action={action as unknown as (fd: FormData) => Promise<void>} className="rounded-3xl border border-slate-200 bg-white p-6 space-y-5">
    <div><h2 className="text-lg font-bold text-teal-950">Create Interactive Textbook / Audio Course</h2><p className="mt-1 text-xs text-slate-500">Lesson text and settings are saved in Neon. The main PDF, audio, images and covers are uploaded to private storage, so large files do not pass through a server action or get embedded as base64.</p></div>
    <input type="hidden" name="fileUrl" value={payload} /><input type="hidden" name="coverUrl" value={coverRef} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-bold text-slate-600 sm:col-span-2">Course / Textbook Title<input name="title" required maxLength={140} placeholder="e.g. Daily English Conversation Vol. 1" className={input}/></label>
      <label className="text-xs font-bold text-slate-600">Type<select name="kind" value={kind} onChange={e=>setKind(e.target.value as typeof kind)} className={input}><option value="textbook">Textbook + Audio</option><option value="audio">Audio Course</option><option value="worksheet">Interactive Worksheet</option></select></label>
      <label className="text-xs font-bold text-slate-600">Course category<select name="category" defaultValue="general" className={input}><option value="general">General English</option><option value="conversation">Conversation</option><option value="natural_conversation">Natural Conversation</option><option value="ielts">IELTS Preparation</option><option value="toefl">TOEFL Preparation</option><option value="toeic">TOEIC Preparation</option><option value="business_english">Business English</option><option value="kids">English for Kids</option><option value="grammar">Grammar</option><option value="vocabulary">Vocabulary</option><option value="pronunciation">Pronunciation</option><option value="academic_english">Academic English</option><option value="travel_english">Travel English</option><option value="reading_writing">Reading &amp; Writing</option><option value="exam_prep">Other Exam Preparation</option></select></label>
      <label className="text-xs font-bold text-slate-600">Language<select name="language" defaultValue="en" className={input}><option value="en">English</option><option value="zh">Chinese Support</option><option value="ja">Japanese Support</option></select></label>
      <label className="text-xs font-bold text-slate-600">Level<select name="level" defaultValue="B1" className={input}>{["A1","A2","B1","B2","C1","C2"].map(l=><option key={l}>{l}</option>)}</select></label>
      <label className="text-xs font-bold text-slate-600 sm:col-span-2">📘 Main textbook PDF (optional, max 25 MB)<input type="file" accept="application/pdf,.pdf" onChange={e=>handleUpload(e.target.files?.[0],setPdfRef,"textbook")} className="mt-1.5 block w-full text-xs"/>{pdfRef&&<span className="text-[11px] text-emerald-700">✓ PDF uploaded privately</span>}<span className="mt-2 block">PDF page count (optional)<input type="number" min="1" max="10000" value={pageCount || ""} onChange={e=>setPageCount(Math.max(0,Math.min(10000,Number(e.target.value)||0)))} placeholder="e.g. 120" className={input}/></span></label>
      <label className="text-xs font-bold text-slate-600">Cover image (optional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>handleUpload(e.target.files?.[0],setCoverRef,"textbook")} className="mt-1.5 block w-full text-xs"/>{coverRef&&<span className="text-[11px] text-emerald-700">✓ Cover uploaded privately</span>}</label>
    </div>
    <label className="block text-xs font-bold text-slate-600">Short Summary<textarea name="description" rows={2} maxLength={500} placeholder="What will students learn in this textbook?" className={input}/></label>
    <div className="space-y-4 border-t border-slate-100 pt-4">
      <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-teal-950">Course Lessons ({units.length})</h3><button type="button" onClick={()=>setUnits(prev=>[...prev,{title:`Lesson ${prev.length+1}`,content:"",audioRef:"",imageRef:""}])} className="rounded-xl bg-teal-50 px-3.5 py-2 text-xs font-bold text-teal-800">+ Add Another Lesson</button></div>
      {units.map((u,idx)=><div key={idx} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4"><div className="flex items-center justify-between"><span className="text-xs font-black uppercase text-teal-800">Lesson #{idx+1}</span>{units.length>1&&<button type="button" onClick={()=>setUnits(prev=>prev.filter((_,i)=>i!==idx))} className="text-xs font-bold text-red-600">Remove</button>}</div>
        <label className="block text-xs font-bold text-slate-600">Lesson Title<input value={u.title} onChange={e=>updateUnit(idx,{title:e.target.value})} required className={input}/></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">🎧 Audio track (MP3/WAV/OGG/M4A/AAC, max 25 MB)<input type="file" accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4,audio/aac,.mp3,.wav,.ogg,.m4a,.aac" onChange={e=>handleUpload(e.target.files?.[0],ref=>updateUnit(idx,{audioRef:ref}),"audio")} className="mt-1.5 block w-full text-xs"/>{u.audioRef&&<span className="text-[11px] text-emerald-700">✓ Audio uploaded privately</span>}</label>
        <label className="text-xs font-bold text-slate-600">🖼 Lesson image (optional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>handleUpload(e.target.files?.[0],ref=>updateUnit(idx,{imageRef:ref}),"textbook")} className="mt-1.5 block w-full text-xs"/>{u.imageRef&&<span className="text-[11px] text-emerald-700">✓ Image uploaded privately</span>}</label></div>
        <label className="block text-xs font-bold text-slate-600">Lesson Reading Text / Dialogue / Vocabulary<textarea value={u.content} onChange={e=>updateUnit(idx,{content:e.target.value})} rows={5} className={input} placeholder="Write the dialogue, reading passage, vocabulary list, and questions..."/></label>
      </div>)}
    </div>
    <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" name="published" defaultChecked className="accent-teal-700"/>Publish immediately (available to teachers inside LingoRoom)</label>
    {busy&&<p className="text-xs font-semibold text-teal-700">Uploading directly to private storage. Large files may take a little while; keep this page open…</p>}{err&&<p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-600">{err}</p>}{state?.error&&<p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-600">Could not save course: {state.error}</p>}{state?.ok&&<p role="status" className="rounded-xl bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800">✓ Course saved.</p>}
    <button disabled={pending||busy} className="rounded-xl bg-teal-800 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{pending?"Saving course…":busy?"Uploading…":"Save Course"}</button>
  </form>;
}
