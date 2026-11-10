"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const ACTIVE = new Set(["creating", "pending", "confirming", "partially_paid"]);

export default function CryptoOrderSync({ orderId, initialStatus }: { orderId: number; initialStatus: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const statusRef = useRef(initialStatus);
  statusRef.current = status;

  const check = useCallback(async (manual = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (manual) setChecking(true);
    try {
      const response = await fetch(`/api/crypto/orders/${orderId}/sync`, { method: "POST", cache: "no-store" });
      const data = await response.json() as { status?: string; error?: string };
      if (!response.ok || !data.status) throw new Error(data.error || "Status check failed.");
      if (statusRef.current !== data.status) router.refresh();
      setStatus(data.status);
      if (manual) setMessage(data.status === "paid" ? "Payment confirmed." : "Status refreshed.");
    } catch (error) {
      if (manual) setMessage(error instanceof Error ? error.message : "Status check failed.");
    } finally {
      inFlight.current = false;
      if (manual) setChecking(false);
    }
  }, [orderId, router]);

  useEffect(() => { setStatus(initialStatus); }, [initialStatus]);
  useEffect(() => {
    if (!ACTIVE.has(status)) return;
    const first = window.setTimeout(() => { if (document.visibilityState === "visible") void check(); }, 12_000);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void check(); }, 20_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [check, status]);

  if (!ACTIVE.has(status)) return null;
  return <span className="inline-flex flex-col items-start gap-1">
    <button type="button" onClick={() => void check(true)} disabled={checking} className="rounded-lg border border-teal-200 px-2.5 py-1.5 text-[11px] font-bold text-teal-800 hover:bg-teal-50 disabled:opacity-50">{checking ? "Checking…" : "Check status"}</button>
    {message && <span role="status" className="max-w-48 text-[10px] leading-4 text-slate-500">{message}</span>}
  </span>;
}
