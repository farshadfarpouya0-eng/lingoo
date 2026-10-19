"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import type { ReactNode } from "react";

type NavItem = { key: string; label: string; icon: string; hint?: string };
const items: NavItem[] = [
  { key: "/admin", label: "Dashboard", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z", hint: "Overview" },
  { key: "/admin/content", label: "Content", icon: "M4 5h16M4 12h16M4 19h10", hint: "Text & images" },
  { key: "/admin/materials", label: "Textbooks & audio", icon: "M4 4h16v16H4zM8 8h8M8 12h8", hint: "Learning library" },
  { key: "/admin/reports", label: "Lesson reports", icon: "M12 9v4m0 4h.01M10 3h4l8 16H2z", hint: "Review issues" },
  { key: "/admin/moderation", label: "Safety & appeals", icon: "M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z", hint: "Cases and appeals" },
  { key: "/admin/documents", label: "Teacher documents", icon: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6", hint: "Verify teachers" },
  { key: "/admin/tutors", label: "Tutors", icon: "M12 12a5 5 0 100-10 5 5 0 000 10zM4 21a8 8 0 0116 0", hint: "Manage tutors" },
  { key: "/admin/students", label: "Students", icon: "M16 19v-1a4 4 0 00-4-4H7M12 12a4 4 0 100-8 4 4 0 000 8zM21 19v-1a4 4 0 00-3-3.87", hint: "Manage students" },
  { key: "/admin/lessons", label: "Lessons", icon: "M8 2v4M16 2v4M3 8h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z", hint: "All lessons" },
  { key: "/admin/payouts", label: "Payouts", icon: "M3 7h18v10H3zM12 12a2 2 0 100-4 2 2 0 000 4z", hint: "Approve payouts" },
  { key: "/admin/teacher-bonuses", label: "Teacher bonuses", icon: "M12 2l2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9z", hint: "Rating-based bonuses" },
  { key: "/admin/integrations", label: "Integrations", icon: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71", hint: "Email, storage, payments" },
  { key: "/admin/settings", label: "Settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 01-.1 1.2l2 1.6-2 3.4-2.4-1a7 7 0 01-2 1.2l-.4 2.6h-4l-.4-2.6a7 7 0 01-2-1.2l-2.4 1-2-3.4 2-1.6A7 7 0 015 12a7 7 0 01.1-1.2l-2-1.6 2-3.4 2.4 1a7 7 0 012-1.2l.4-2.6h4l.4 2.6a7 7 0 012 1.2l2.4-1 2 3.4-2 1.6A7 7 0 0119 12z", hint: "Site settings" },
];
export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = items.find(i => i.key === "/admin" ? pathname === "/admin" : pathname === i.key || pathname.startsWith(`${i.key}/`))?.key || "";
  return (
    <div className="min-h-screen bg-[#f5f6f4]">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 p-4 lg:flex-row lg:gap-8 lg:p-8">
        <aside className="lg:w-60 lg:shrink-0">
          <div className="sticky top-6 rounded-3xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between px-2 py-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Admin</span>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-400 text-teal-950">
                <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" strokeLinejoin="round" /></svg>
              </span>
            </div>
            <nav className="mt-1 flex gap-1 overflow-x-auto lg:flex-col">
              {items.map(i => {
                const activeNow = i.key === active;
                return (
                  <Link key={i.key} href={i.key} className={`group flex shrink-0 items-center gap-3 rounded-2xl px-3 py-2.5 lg:shrink ${activeNow ? "bg-teal-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d={i.icon} /></svg>
                    <span className="whitespace-nowrap">{i.label}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="mt-3 border-t border-slate-100 px-2 pt-3 text-[11px] text-slate-400">
              <Link href="/" className="hover:text-teal-700">← View site</Link>
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
