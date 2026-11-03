"use client";
import { useState, useActionState } from "react";
import { saveSiteContentAndSettings, resetContent } from "@/lib/admin-actions";
import type { HomeContent, Settings } from "@/lib/site-content";
import { LANGS } from "@/lib/i18n";

type V = HomeContent;
const input = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500";
const IMG_PRESETS = [
  { label: "Hero online", url: "/images/hero-online.webp" },
  { label: "Tutor online", url: "/images/feature-tutor.webp" },
  { label: "Study", url: "/images/feature-study.webp" },
  { label: "Schedule", url: "/images/feature-schedule.webp" },
  { label: "Onboarding", url: "/images/teacher-onboarding.webp" },
  { label: "Birdie", url: "/images/kids-birdie.jpg" },
  { label: "Teddy", url: "/images/kids-teddy.jpg" },
  { label: "Lulu", url: "/images/kids-lulu.jpg" },
  { label: "Nini", url: "/images/kids-nini.jpg" },
  { label: "Momo", url: "/images/kids-momo.jpg" },
  { label: "Piki", url: "/images/kids-piki.jpg" },
];

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
      {type === "textarea"
        ? <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-teal-500" />
        : <input type={type} value={value} onChange={e => onChange(e.target.value)} className={input} />}
    </label>
  );
}
function ImageField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
      <div className="flex items-center gap-3">
        {value && <img src={value} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />}
        <input value={value} onChange={e => onChange(e.target.value)} className={input} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {IMG_PRESETS.map(p => (
          <button type="button" key={p.url} onClick={() => onChange(p.url)} className={`rounded-md px-2 py-1 text-[11px] ${value === p.url ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{p.label}</button>
        ))}
      </div>
    </label>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between px-5 py-3.5 text-left">
        <span className="font-bold text-teal-950">{title}</span>
        <span className="text-lg text-slate-400">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="grid gap-3 border-t border-slate-100 p-5 sm:grid-cols-2">{children}</div>}
    </div>
  );
}
function RowEditor<T extends object>({ items, onChange, fields, addLabel, makeNew }: { items: T[]; onChange: (items: T[]) => void; fields: (item: T, set: (patch: Partial<T>) => void) => React.ReactNode; addLabel: string; makeNew: () => T }) {
  return (
    <div className="space-y-3 sm:col-span-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-2 flex justify-end"><button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-xs text-red-500">Remove</button></div>
          <div className="grid gap-3 sm:grid-cols-2">{fields(item, patch => onChange(items.map((it, j) => j === i ? { ...it, ...patch } : it)))}</div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, makeNew()])} className="text-sm font-semibold text-teal-700">+ {addLabel}</button>
    </div>
  );
}

export default function ContentEditor({ initialContent, initialSettings }: { initialContent: V; initialSettings: Settings }) {
  const [content, setContent] = useState<V>(initialContent);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [state, action, pending] = useActionState(saveSiteContentAndSettings, { ok: false });
  const set = (patch: Partial<V>) => setContent(c => ({ ...c, ...patch }));
  const setArr = (key: keyof V, items: unknown[]) => setContent(c => ({ ...c, [key]: items }));
  const setObj = (key: keyof V, patch: Record<string, unknown>) => setContent(c => ({ ...c, [key]: { ...(c[key] as object), ...patch } }));

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    action(fd);
  };
  const reset = async () => {
    const fd = new FormData(); fd.set("lang", "en");
    await resetContent(undefined, fd);
    window.location.reload();
  };

  const err = state?.ok ? null : "Could not save. Make sure each section is valid.";
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Changes publish instantly to the public site.</p>
        <div className="flex items-center gap-2">
            {state?.ok && <span className="text-xs font-semibold text-emerald-600">Saved ✓</span>}
          <button type="button" onClick={reset} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50">Reset</button>
          <button type="submit" disabled={pending} className="rounded-xl bg-teal-800 px-6 py-3 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">{pending ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
      {err && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{err}</p>}
      <input type="hidden" name="lang" value="en" />
      <input type="hidden" name="content" value={JSON.stringify(content)} />
      <input type="hidden" name="settings" value={JSON.stringify(settings)} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Hero">
          <Field label="Badge" value={content.hero.badge} onChange={v => setObj("hero", { badge: v })} />
          <Field label="Title (line 1)" value={content.hero.titleA} onChange={v => setObj("hero", { titleA: v })} />
          <Field label="Title (line 2, highlighted)" value={content.hero.titleB} onChange={v => setObj("hero", { titleB: v })} />
          <Field label="Subtitle" value={content.hero.subtitle} onChange={v => setObj("hero", { subtitle: v })} type="textarea" />
          <div className="sm:col-span-2"><ImageField label="Hero image" value={content.hero.image} onChange={v => setObj("hero", { image: v })} /></div>
          <Field label="Hero image alt" value={content.hero.imageAlt} onChange={v => setObj("hero", { imageAlt: v })} />
        </Section>
        <Section title="Site settings">
          <Field label="Site name" value={settings.siteName} onChange={v => setSettings(s => ({ ...s, siteName: v }))} />
          <Field label="Contact email" value={settings.contactEmail} onChange={v => setSettings(s => ({ ...s, contactEmail: v }))} />
          <div className="sm:col-span-2"><Field label="Footer tagline" value={settings.footerTagline} onChange={v => setSettings(s => ({ ...s, footerTagline: v }))} type="textarea" /></div>
        </Section>
        <Section title="Stats">
          <RowEditor items={content.stats} onChange={items => setArr("stats", items)} addLabel="Stat" makeNew={() => ({ value: "", label: "" })} fields={(it, set) => <><Field label="Value" value={it.value} onChange={v => set({ value: v })} /><Field label="Label" value={it.label} onChange={v => set({ label: v })} /></>} />
        </Section>
        <Section title="Search & trust">
          <Field label="Search goal label" value={content.searchGoal} onChange={v => set({ searchGoal: v })} />
          <Field label="Search button" value={content.searchBtn} onChange={v => set({ searchBtn: v })} />
          <Field label="Search placeholder" value={content.searchPlaceholder} onChange={v => set({ searchPlaceholder: v })} />
          <div className="sm:col-span-2"><Field label="Trust line" value={content.trust} onChange={v => set({ trust: v })} /></div>
        </Section>
        <Section title="Goals section">
          <Field label="Title" value={content.goals.title} onChange={v => setObj("goals", { title: v })} />
          <Field label="Subtitle" value={content.goals.subtitle} onChange={v => setObj("goals", { subtitle: v })} />
          <RowEditor items={content.goals.items} onChange={items => setObj("goals", { items })} addLabel="Goal" makeNew={() => ({ tag: "", title: "", text: "" })} fields={(it, set) => <><Field label="Tag" value={it.tag} onChange={v => set({ tag: v })} /><Field label="Title" value={it.title} onChange={v => set({ title: v })} /><div className="sm:col-span-2"><Field label="Text" value={it.text} onChange={v => set({ text: v })} /></div></>} />
        </Section>
        <Section title="Kids section">
          <Field label="Title" value={content.kids.title} onChange={v => setObj("kids", { title: v })} />
          <Field label="CTA button" value={content.kids.cta} onChange={v => setObj("kids", { cta: v })} />
          <div className="sm:col-span-2"><Field label="Subtitle" value={content.kids.subtitle} onChange={v => setObj("kids", { subtitle: v })} type="textarea" /></div>
          <RowEditor items={content.kids.characters} onChange={items => setObj("kids", { characters: items })} addLabel="Character" makeNew={() => ({ name: "", activity: "", text: "", image: "", alt: "" })} fields={(it, set) => <><Field label="Name" value={it.name} onChange={v => set({ name: v })} /><Field label="Activity" value={it.activity} onChange={v => set({ activity: v })} /><div className="sm:col-span-2"><ImageField label="Image" value={it.image} onChange={v => set({ image: v })} /></div><div className="sm:col-span-2"><Field label="Text" value={it.text} onChange={v => set({ text: v })} /></div></>} />
        </Section>
        <Section title="Details (feature rows)">
          <Field label="Title" value={content.details.title} onChange={v => setObj("details", { title: v })} />
          <Field label="Subtitle" value={content.details.subtitle} onChange={v => setObj("details", { subtitle: v })} />
          <RowEditor items={content.details.items} onChange={items => setObj("details", { items })} addLabel="Row" makeNew={() => ({ kicker: "", title: "", text: "", bullets: [], stat: "", statLabel: "", image: "", alt: "" })} fields={(it, set) => <><Field label="Kicker" value={it.kicker} onChange={v => set({ kicker: v })} /><Field label="Stat" value={it.stat} onChange={v => set({ stat: v })} /><Field label="Title" value={it.title} onChange={v => set({ title: v })} /><Field label="Stat label" value={it.statLabel} onChange={v => set({ statLabel: v })} /><div className="sm:col-span-2"><Field label="Text" value={it.text} onChange={v => set({ text: v })} type="textarea" /></div><div className="sm:col-span-2"><ImageField label="Image" value={it.image} onChange={v => set({ image: v })} /></div><div className="sm:col-span-2"><Field label="Bullets (one per line)" value={it.bullets.join("\n")} onChange={v => set({ bullets: v.split("\n") })} type="textarea" /></div></>} />
        </Section>
        <Section title="How it works">
          <Field label="Title" value={content.how.title} onChange={v => setObj("how", { title: v })} />
          <Field label="Subtitle" value={content.how.subtitle} onChange={v => setObj("how", { subtitle: v })} />
          <RowEditor items={content.how.steps} onChange={items => setObj("how", { steps: items })} addLabel="Step" makeNew={() => ({ title: "", text: "" })} fields={(it, set) => <><Field label="Title" value={it.title} onChange={v => set({ title: v })} /><Field label="Text" value={it.text} onChange={v => set({ text: v })} type="textarea" /></>} />
        </Section>
        <Section title="Why (benefits)">
          <Field label="Title" value={content.why.title} onChange={v => setObj("why", { title: v })} />
          <Field label="Subtitle" value={content.why.subtitle} onChange={v => setObj("why", { subtitle: v })} />
          <RowEditor items={content.why.items} onChange={items => setObj("why", { items })} addLabel="Benefit" makeNew={() => ({ title: "", text: "" })} fields={(it, set) => <><Field label="Title" value={it.title} onChange={v => set({ title: v })} /><Field label="Text" value={it.text} onChange={v => set({ text: v })} type="textarea" /></>} />
        </Section>
        <Section title="Comparison">
          <Field label="Title" value={content.compare.title} onChange={v => setObj("compare", { title: v })} />
          <Field label="Our column" value={content.compare.us} onChange={v => setObj("compare", { us: v })} />
          <Field label="Their column" value={content.compare.them} onChange={v => setObj("compare", { them: v })} />
          <RowEditor items={content.compare.rows} onChange={items => setObj("compare", { rows: items })} addLabel="Row" makeNew={() => ({ label: "", us: "", them: "" })} fields={(it, set) => <><Field label="Label" value={it.label} onChange={v => set({ label: v })} /><Field label="Us" value={it.us} onChange={v => set({ us: v })} /><div className="sm:col-span-2"><Field label="Them" value={it.them} onChange={v => set({ them: v })} /></div></>} />
        </Section>
        <Section title="Reviews">
          <Field label="Title" value={content.reviews.title} onChange={v => setObj("reviews", { title: v })} />
          <RowEditor items={content.reviews.items} onChange={items => setObj("reviews", { items })} addLabel="Review" makeNew={() => ({ name: "", from: "", text: "", goal: "" })} fields={(it, set) => <><Field label="Name" value={it.name} onChange={v => set({ name: v })} /><Field label="From" value={it.from} onChange={v => set({ from: v })} /><Field label="Goal" value={it.goal} onChange={v => set({ goal: v })} /><div className="sm:col-span-2"><Field label="Text" value={it.text} onChange={v => set({ text: v })} type="textarea" /></div></>} />
        </Section>
        <Section title="FAQ">
          <Field label="Title" value={content.faq.title} onChange={v => setObj("faq", { title: v })} />
          <RowEditor items={content.faq.items} onChange={items => setObj("faq", { items })} addLabel="Question" makeNew={() => ({ q: "", a: "" })} fields={(it, set) => <><div className="sm:col-span-2"><Field label="Question" value={it.q} onChange={v => set({ q: v })} /></div><div className="sm:col-span-2"><Field label="Answer" value={it.a} onChange={v => set({ a: v })} type="textarea" /></div></>} />
        </Section>
        <Section title="Tutor CTA">
          <Field label="Title" value={content.ctaTutor.title} onChange={v => setObj("ctaTutor", { title: v })} />
          <Field label="Button" value={content.ctaTutor.button} onChange={v => setObj("ctaTutor", { button: v })} />
          <div className="sm:col-span-2"><Field label="Text" value={content.ctaTutor.text} onChange={v => setObj("ctaTutor", { text: v })} type="textarea" /></div>
        </Section>
        <Section title="Final CTA & footer">
          <Field label="Title" value={content.final.title} onChange={v => setObj("final", { title: v })} />
          <Field label="Button" value={content.final.button} onChange={v => setObj("final", { button: v })} />
          <div className="sm:col-span-2"><Field label="Footer tagline" value={content.footer.tagline} onChange={v => setObj("footer", { tagline: v })} /></div>
          <div className="sm:col-span-2"><Field label="Contact email" value={content.footer.contactEmail} onChange={v => setObj("footer", { contactEmail: v })} /></div>
        </Section>
      </div>
      <input type="hidden" name="lang" value="en" />
      <input type="hidden" name="content" value={JSON.stringify(content)} />
      <input type="hidden" name="settings" value={JSON.stringify(settings)} />
    </form>
  );
}
