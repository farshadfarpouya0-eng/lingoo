import Link from "next/link";
import { desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { messages, users } from "@/db/schema";
import { sendMessage } from "@/lib/actions";
import { fmtAtZone } from "@/lib/time";
import type { T, Lang } from "@/lib/i18n";
import Icon from "./Icon";
export default async function MessagesPanel({ userId, contactIds, selectedId, t, lang, timeZone }: { userId:number; contactIds:number[]; selectedId?:number; t:T; lang:Lang; timeZone?:string }) {
  const all=await db.select().from(messages).where(or(eq(messages.fromId,userId),eq(messages.toId,userId))).orderBy(desc(messages.createdAt)).limit(300);
  const ids=new Set([...contactIds,...all.map(m=>m.fromId===userId?m.toId:m.fromId)]);
  const contacts=ids.size?await db.select({id:users.id,name:users.name,avatar:users.avatar}).from(users).where(inArray(users.id,[...ids])):[];
  const selected=contacts.find(c=>c.id===selectedId)||contacts[0];
  const thread=selected?all.filter(m=>m.fromId===selected.id||m.toId===selected.id).reverse():[];
  return <section className="grid min-h-[520px] overflow-hidden rounded-[24px] border border-slate-200 bg-white md:grid-cols-[230px_1fr]"><nav className="border-r border-slate-100 p-3">{contacts.map(c=><Link key={c.id} href={`/dashboard?tab=messages&with=${c.id}`} className={`mb-1 flex items-center gap-3 rounded-xl p-3 ${c.id===selected?.id?"bg-teal-50":"hover:bg-slate-50"}`}><img src={c.avatar||""} alt="" width={36} height={36} className="h-9 w-9 rounded-full bg-slate-100 object-cover"/><span className="text-xs font-semibold text-slate-700">{c.name}</span></Link>)}{!contacts.length&&<p className="p-4 text-sm text-slate-400">{t.noMessages}</p>}</nav>{selected?<div className="flex min-w-0 flex-col p-5"><h2 className="border-b border-slate-100 pb-4 text-sm font-bold text-teal-950">{selected.name}</h2><div className="max-h-[380px] flex-1 space-y-3 overflow-y-auto py-5">{thread.map(m=><div key={m.id} className={`flex ${m.fromId===userId?"justify-end":""}`}><div className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm ${m.fromId===userId?"bg-teal-800 text-white":"bg-slate-100 text-slate-600"}`}>{m.body}<p className="mt-2 text-[10px] opacity-50">{fmtAtZone(m.createdAt,lang,timeZone || "UTC")}</p></div></div>)}</div><form action={sendMessage as unknown as (fd: FormData) => Promise<void>} className="flex gap-2"><input name="to" type="hidden" value={selected.id}/><input name="body" required maxLength={2000} autoComplete="off" placeholder={t.messagePlaceholder} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-teal-500"/><button aria-label={t.sendMessage} className="rounded-xl bg-teal-800 px-4 text-white"><Icon name="arrow"/></button></form></div>:<div className="grid place-items-center text-slate-200"><Icon name="messages" width={48} height={48}/></div>}</section>;
}
