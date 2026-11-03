"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type ChatMessage = { id: number; senderId: number; senderName: string; body: string; createdAt: string | Date };
type PusherFrame = { event?: string; data?: unknown; channel?: string };
function parseFrameData<T>(value: unknown): T | null {
  try { return (typeof value === "string" ? JSON.parse(value) : value) as T; } catch { return null; }
}
function mergeMessages(old: ChatMessage[], next: ChatMessage[]) {
  const map = new Map<number, ChatMessage>();
  for (const m of old) map.set(m.id, m);
  for (const m of next) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.id - b.id).slice(-300);
}
export default function ClassroomChat({ lessonId, userId }: { lessonId: number; userId: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [realtime, setRealtime] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const latest = useRef(0);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/lessons/${lessonId}/chat?after=${latest.current}`, { cache: "no-store" });
      if (!r.ok) return;
      const data = await r.json() as { messages: ChatMessage[]; locked: boolean };
      setLocked(data.locked);
      if (data.messages.length) {
        setMessages(old => mergeMessages(old, data.messages));
        latest.current = Math.max(latest.current, ...data.messages.map(m => m.id));
      }
    } catch { /* A later poll will retry; don't erase already loaded messages. */ }
  }, [lessonId]);

  // Subscribe directly to Pusher's WebSocket protocol without an additional client library.
  // Private-channel auth is still performed by the authenticated Lingorain server.
  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let fallbackTimer: number | undefined;
    let reconnectTimer: number | undefined;
    let hasSubscription = false;
    const connect = async () => {
      try {
        const res = await fetch(`/api/lessons/${lessonId}/chat/realtime`, { cache: "no-store" });
        const cfg = await res.json() as { enabled?: boolean; key?: string; cluster?: string; channel?: string };
        if (stopped || !res.ok || !cfg.enabled || !cfg.key || !cfg.cluster || !cfg.channel) return;
        const channel = cfg.channel;
        socket = new WebSocket(`wss://ws-${encodeURIComponent(cfg.cluster)}.pusher.com/app/${encodeURIComponent(cfg.key)}?protocol=7&client=js&version=8.4.0&flash=false`);
        socket.onmessage = async ev => {
          const frame = parseFrameData<PusherFrame>(ev.data);
          if (!frame?.event) return;
          if (frame.event === "pusher:ping") {
            if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event: "pusher:pong", data: {} }));
            return;
          }
          if (frame.event === "pusher:connection_established") {
            const connection = parseFrameData<{ socket_id?: string }>(frame.data);
            if (!connection?.socket_id) return;
            try {
              const authRes = await fetch(`/api/lessons/${lessonId}/chat/auth`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ socket_id: connection.socket_id, channel_name: channel }) });
              const authData = await authRes.json() as { auth?: string };
              if (!authRes.ok || !authData.auth || stopped || socket?.readyState !== WebSocket.OPEN) return;
              socket.send(JSON.stringify({ event: "pusher:subscribe", data: { auth: authData.auth, channel } }));
            } catch { /* Polling remains available. */ }
            return;
          }
          if (frame.event === "pusher_internal:subscription_succeeded" && frame.channel === channel) {
            hasSubscription = true; setRealtime(true); return;
          }
          if (frame.event === "chat-message" && frame.channel === channel) {
            const incoming = parseFrameData<ChatMessage>(frame.data);
            if (incoming && Number.isSafeInteger(incoming.id)) {
              setMessages(old => mergeMessages(old, [incoming]));
              latest.current = Math.max(latest.current, incoming.id);
            }
          }
        };
        socket.onclose = () => {
          if (stopped) return;
          setRealtime(false); hasSubscription = false;
          reconnectTimer = window.setTimeout(connect, 5000);
        };
        socket.onerror = () => { setRealtime(false); };
      } catch { setRealtime(false); }
    };
    void connect();
    fallbackTimer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 12_000);
    return () => {
      stopped = true;
      if (fallbackTimer) window.clearInterval(fallbackTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (socket) { socket.onclose = null; socket.close(); }
      if (hasSubscription) setRealtime(false);
    };
  }, [lessonId, load]);

  useEffect(() => {
    void load();
    // Without the optional realtime provider, use authenticated DB polling.
    const timer = window.setInterval(() => { if (!realtime && document.visibilityState === "visible") void load(); }, realtime ? 12_000 : 2200);
    return () => window.clearInterval(timer);
  }, [load, realtime]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages.length]);

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const text = body.trim(); if (!text || sending || locked) return;
    setSending(true); setError("");
    try {
      const r = await fetch(`/api/lessons/${lessonId}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
      const data = await r.json() as { message?: ChatMessage; error?: string };
      if (!r.ok || !data.message) { setError(data.error || "Message could not be sent."); return; }
      setMessages(old => mergeMessages(old, [data.message!])); latest.current = Math.max(latest.current, data.message.id); setBody("");
    } catch { setError("Connection error. Please try again."); }
    finally { setSending(false); }
  }
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="border-b border-slate-100 px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-teal-950">Class chat</h2><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${realtime ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{realtime ? "Live connection" : "Fallback sync"}</span></div><p className="mt-1 text-xs text-slate-500">Messages are available only to participants of this lesson.</p></div>
    <div className="max-h-80 min-h-36 space-y-3 overflow-y-auto p-4" aria-live="polite">
      {messages.length ? messages.map(m => <div key={m.id} className={`flex ${m.senderId === userId ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-3 py-2 ${m.senderId === userId ? "bg-teal-800 text-white" : "bg-slate-100 text-slate-800"}`}><p className="mb-1 text-[10px] font-semibold opacity-70">{m.senderId === userId ? "You" : m.senderName}</p><p className="whitespace-pre-wrap break-words text-sm">{m.body}</p><p className="mt-1 text-right text-[10px] opacity-60">{new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div></div>) : <p className="py-8 text-center text-sm text-slate-400">No messages yet.</p>}
      <div ref={bottom}/>
    </div>
    {locked ? <p className="border-t bg-slate-50 px-4 py-3 text-xs text-slate-500">Chat becomes available during your class access window.</p> : <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-3"><input value={body} onChange={e => setBody(e.target.value)} maxLength={1000} placeholder="Write a message…" aria-label="Chat message" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600"/><button disabled={sending || !body.trim()} className="rounded-xl bg-teal-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{sending ? "…" : "Send"}</button></form>}
    {error && <p role="alert" className="px-4 pb-3 text-xs text-red-600">{error}</p>}
  </section>;
}
