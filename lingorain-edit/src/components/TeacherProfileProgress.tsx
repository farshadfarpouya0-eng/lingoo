type Item = { key: string; label: string; points: number; complete: boolean; href: string; pending?: boolean };

export default function TeacherProfileProgress({ items, credentialVerified }: { items: Item[]; credentialVerified: boolean }) {
  const score = items.reduce((total, item) => total + (item.complete ? item.points : 0), 0);
  const missing = items.filter(item => !item.complete);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-labelledby="teacher-profile-progress-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="teacher-profile-progress-title" className="text-lg font-bold text-teal-950">Profile completeness</h2>
        <p className="mt-1 text-sm text-slate-500">Complete the core profile sections so students can understand your teaching offer.</p>
      </div>
      <strong className="text-2xl font-black tabular-nums text-teal-800">{score}%</strong>
    </div>
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-700 transition-all" style={{ width: `${score}%` }} /></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {items.map(item => <a key={item.key} href={item.href} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm hover:bg-teal-50">
        <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${item.complete ? "bg-emerald-100 text-emerald-700" : item.pending ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-500"}`}>{item.complete ? "✓" : item.pending ? "…" : "·"}</span><span className="truncate text-slate-700">{item.label}{item.pending ? " · pending review" : ""}</span></span>
        <span className="shrink-0 text-[11px] font-semibold text-slate-400">{item.points} pts</span>
      </a>)}
    </div>
    <div className="mt-4 rounded-xl border border-slate-100 p-3">
      <p className="text-sm font-semibold text-teal-950">Optional credibility</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">University certificates and teaching credentials are optional and do not reduce your completeness score. Once an administrator verifies one, your public profile receives a credential badge.</p>
      <p className={`mt-2 text-xs font-bold ${credentialVerified ? "text-emerald-700" : "text-slate-500"}`}>{credentialVerified ? "Credential badge active" : "No optional credential badge yet"}</p>
    </div>
    {missing.length > 0 && <p className="mt-3 text-xs leading-5 text-slate-500">Remaining: {missing.map(item => item.label).join(", ")}. Select a section above to complete it.</p>}
    {missing.length === 0 && <p className="mt-3 text-xs font-semibold text-emerald-700">Your core teacher profile is complete.</p>}
  </section>;
}
