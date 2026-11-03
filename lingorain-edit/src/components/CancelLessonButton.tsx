"use client";
export default function CancelLessonButton({ label, late, message }: { label: string; late: boolean; message: string }) {
  return <button name="action" value="cancel" onClick={e=>{if(late&&!window.confirm(message))e.preventDefault();}} className={`rounded-lg border px-3 py-2 text-xs font-medium ${late?"border-red-200 text-red-500":"border-slate-200 text-slate-400 hover:text-red-500"}`}>{label}</button>;
}
