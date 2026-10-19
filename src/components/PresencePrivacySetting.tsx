import { setPresenceVisibility } from "@/lib/presence-actions";

export default function PresencePrivacySetting({ visible }: { visible: boolean }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="font-bold text-teal-950">Online status privacy</h2>
    <p className="mt-1 text-sm leading-6 text-slate-500">Choose whether people in your classroom can see your online and last-seen status. This does not hide your participation in an active class.</p>
    <form action={setPresenceVisibility} className="mt-4 flex flex-wrap items-center justify-between gap-4">
      <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
        <input type="checkbox" name="visible" defaultChecked={visible} className="h-4 w-4 accent-teal-700" />
        Show my online status and last seen
      </label>
      <button className="rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-bold text-white">Save privacy setting</button>
    </form>
  </section>;
}
