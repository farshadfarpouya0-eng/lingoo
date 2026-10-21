"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Lang, T } from "@/lib/i18n";
const LANGS = [{ code: "zh", label: "中文" }, { code: "ja", label: "日本語" }, { code: "en", label: "English" }] as const;
import type { LandingCopy } from "@/lib/landing-i18n";
import { logout, setLang } from "@/lib/actions";
import Icon from "./Icon";
export default function MobileMenu({ lang, c, t, user }: { lang:Lang; c:LandingCopy; t:T; user:{name:string;avatar:string|null;role:string}|null }) {
  const dialog=useRef<HTMLDialogElement>(null);
  const pathname=usePathname();
  const close=()=>{dialog.current?.close();document.body.style.overflow="";};
  useEffect(()=>{dialog.current?.close();},[pathname,lang]);
  useEffect(()=>()=>{document.body.style.overflow="";},[]);
  const open=()=>{dialog.current?.showModal();document.body.style.overflow="hidden";};
  return <div className="mobile-menu-control"><button type="button" aria-label={c.menu} aria-haspopup="dialog" className="mobile-menu-toggle" onClick={open}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h11" strokeLinecap="round"/></svg></button><dialog ref={dialog} className="mobile-nav-dialog" aria-label={c.navigation} onCancel={()=>{document.body.style.overflow="";}} onClose={()=>{document.body.style.overflow="";}} onClick={e=>{if(e.target===e.currentTarget)close();}}><div className="mobile-nav-inner"><div className="mobile-nav-top"><span className="mobile-nav-brand">Lingorain</span><button type="button" aria-label={c.closeMenu} onClick={close}><Icon name="close" width={22} height={22}/></button></div>{user&&<div className="mobile-nav-account"><img src={user.avatar||""} alt="" width={40} height={40}/><div><b>{user.name}</b><span>{user.role==="teacher"?t.teacher:t.student}</span></div></div>}<p className="mobile-nav-kicker">{c.navigation}</p><nav className="mobile-nav-links"><Link href="/teachers?audience=adults" onClick={close}>{c.adultNav}<Icon name="arrow" width={18} height={18}/></Link><Link href="/teachers?audience=kids&tag=Kids" onClick={close}>{c.kidsNav}<Icon name="arrow" width={18} height={18}/></Link><Link href="/teachers" onClick={close}>{c.allTutors}<Icon name="arrow" width={18} height={18}/></Link><a href="/#how-it-works" onClick={close}>{c.howNav}<Icon name="arrow" width={18} height={18}/></a><a href="/#faq" onClick={close}>{c.faqNav}<Icon name="arrow" width={18} height={18}/></a>{user&&<Link href={user.role==="admin"?"/admin":"/dashboard"} onClick={close}>{user.role==="admin"?t.admin:c.learningNav}<Icon name="arrow" width={18} height={18}/></Link>}</nav><div className="mobile-nav-language"><p>{c.language}</p><form action={setLang as unknown as (fd: FormData) => Promise<void>} onSubmit={close}>{LANGS.map(l=><button key={l.code} name="lang" value={l.code} aria-pressed={lang===l.code} className={lang===l.code?"active":""}>{l.code==="en"?"English":l.label}</button>)}</form></div><div className="mobile-nav-actions">{user?<><Link href="/dashboard" onClick={close} className="mobile-nav-primary">{t.dashboard}</Link><form action={logout as unknown as (fd: FormData) => Promise<void>} onSubmit={close}><button type="submit">{t.logout}</button></form></>:<><Link href="/register" onClick={close} className="mobile-nav-primary">{t.register}</Link><Link href="/login" onClick={close}>{t.login}</Link></>}</div><p className="mobile-nav-footer">{c.personal}</p></div></dialog></div>;
}
