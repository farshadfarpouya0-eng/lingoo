"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CryptoOrderDTO } from "@/lib/crypto-orders";
import CopyTextButton from "@/components/CopyTextButton";

export type WalletNetwork = {
  asset: string;
  label: string;
  network: string;
  coin: string;
  directEnabled: boolean;
  nowpaymentsEnabled: boolean;
  plisioEnabled: boolean;
  address: string;
};

const AMOUNTS = [2000, 5000, 10000, 20000] as const;
const ACTIVE_STATUSES = new Set(["creating", "awaiting_payment", "pending", "confirming", "pending_review", "partially_paid"]);
const POLLABLE_PROVIDER = new Set(["creating", "pending", "confirming", "partially_paid"]);

const ERROR_TEXT: Record<string, string> = {
  crypto: "Check the selected coin, network and amount, then try again.",
  crypto_setup: "Crypto payments are not initialized yet. Ask an administrator to apply migrations 0017 and 0018.",
  crypto_unavailable: "This crypto network or provider is not enabled by the administrator.",
  crypto_config: "Crypto payments need a valid public APP_URL before a gateway invoice can be created.",
  crypto_quote: "The live BNB/TRX quote is unavailable. Wait a moment and try again.",
  crypto_provider: "The payment provider could not create this invoice. Try again or choose another network.",
  crypto_hash: "Enter the 64-character blockchain transaction hash.",
  crypto_expired: "This payment request has expired. Create a new request before sending funds.",
  crypto_duplicate: "This transaction hash has already been submitted for another payment.",
  crypto_submitted: "This transfer has already been submitted for review.",
  rate: "Too many crypto payment requests. Please wait and try again.",
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const coinOf = (asset: string) => (asset.startsWith("usdt") ? "USDT" : asset.startsWith("bnb") ? "BNB" : "TRX");
const providerLabel = (provider: string) => (provider === "nowpayments" ? "NOWPayments" : provider === "plisio" ? "Plisio" : "Direct wallet");

function statusPill(status: string) {
  if (status === "paid") return "bg-emerald-50 text-emerald-700";
  if (status === "pending_review") return "bg-amber-50 text-amber-800";
  if (status === "rejected" || status === "failed" || status === "expired" || status === "partially_paid") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-600";
}

function useNowTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function formatRemaining(expiresAt: string | null, now: number) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return "expired";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} left`;
}

export default function CryptoWallet({
  networks,
  initialOrders,
  nowConfigured,
  plisioConfigured,
  timeZone,
}: {
  networks: WalletNetwork[];
  initialOrders: CryptoOrderDTO[];
  nowConfigured: boolean;
  plisioConfigured: boolean;
  timeZone: string;
}) {
  const providerAvailable = useCallback(
    (network: WalletNetwork, provider: string) =>
      provider === "nowpayments" ? nowConfigured && network.nowpaymentsEnabled : plisioConfigured && network.plisioEnabled,
    [nowConfigured, plisioConfigured],
  );
  const anyProvider = useMemo(
    () => networks.some((n) => providerAvailable(n, "nowpayments") || providerAvailable(n, "plisio")),
    [networks, providerAvailable],
  );
  const anyDirect = useMemo(() => networks.some((n) => n.directEnabled && n.address), [networks]);

  const [orders, setOrders] = useState<CryptoOrderDTO[]>(initialOrders);
  const [activeId, setActiveId] = useState<number | null>(() => {
    const active = initialOrders.find((o) => ACTIVE_STATUSES.has(o.status));
    return active ? active.id : null;
  });
  const [method, setMethod] = useState<"provider" | "direct">(anyProvider ? "provider" : "direct");
  const [provider, setProvider] = useState<string>(() =>
    networks.some((n) => providerAvailable(n, "nowpayments")) ? "nowpayments" : "plisio",
  );
  const [asset, setAsset] = useState<string>("");
  const [amountUsd, setAmountUsd] = useState<number>(2000);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [proofError, setProofError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const activePanelRef = useRef<HTMLDivElement>(null);

  // Keep local orders in sync if the server renders newer data (e.g. after navigation),
  // without resetting the student's in-progress selections.
  useEffect(() => {
    setOrders((prev) => {
      if (prev.length === initialOrders.length && prev.every((o, i) => o.id === initialOrders[i]?.id && o.status === initialOrders[i]?.status && o.txHash === initialOrders[i]?.txHash)) {
        return prev;
      }
      const merged = new Map<number, CryptoOrderDTO>();
      for (const o of [...initialOrders, ...prev]) {
        if (!merged.has(o.id)) merged.set(o.id, o);
      }
      return [...merged.values()].sort((a, b) => b.id - a.id).slice(0, 8);
    });
  }, [initialOrders]);

  const methodOptions = useMemo(
    () => networks.filter((n) => (method === "direct" ? n.directEnabled && n.address : providerAvailable(n, provider))),
    [networks, method, provider, providerAvailable],
  );
  const selectedAsset = methodOptions.some((n) => n.asset === asset) ? asset : methodOptions[0]?.asset || "";
  const selectedNetwork = methodOptions.find((n) => n.asset === selectedAsset);

  const activeOrder = orders.find((o) => o.id === activeId) || null;
  const activeIsExpired =
    !!activeOrder &&
    activeOrder.method === "direct" &&
    activeOrder.status === "awaiting_payment" &&
    !!activeOrder.expiresAt &&
    new Date(activeOrder.expiresAt).getTime() <= Date.now();
  const displayStatus = activeIsExpired ? "expired" : activeOrder?.status || "";
  const countdownActive = !!activeOrder && ACTIVE_STATUSES.has(activeOrder.status);
  const now = useNowTick(countdownActive);
  const remaining = activeOrder ? formatRemaining(activeOrder.expiresAt, now) : null;

  const scrollToActive = useCallback(() => {
    window.setTimeout(() => {
      activePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
  }, []);

  const createOrder = useCallback(async () => {
    if (creating || !selectedAsset) return;
    setCreating(true);
    setFormError("");
    try {
      const response = await fetch("/api/crypto/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd, method, provider, asset: selectedAsset }),
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as { order?: CryptoOrderDTO; orders?: CryptoOrderDTO[]; error?: string; code?: string };
      if (!response.ok || !data.order) {
        if (data.orders) setOrders(data.orders.slice(0, 8));
        throw new Error((data.code && ERROR_TEXT[data.code]) || data.error || ERROR_TEXT.crypto);
      }
      setOrders((prev) => [data.order!, ...prev.filter((o) => o.id !== data.order!.id)].slice(0, 8));
      setActiveId(data.order.id);
      setTxHash("");
      setProofError("");
      setSyncMessage("");
      scrollToActive();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : ERROR_TEXT.crypto);
    } finally {
      setCreating(false);
    }
  }, [creating, selectedAsset, amountUsd, method, provider, scrollToActive]);

  const submitProof = useCallback(async () => {
    if (!activeOrder || submitting) return;
    const value = txHash.trim();
    if (!/^(?:0x)?[a-fA-F0-9]{64}$/.test(value)) {
      setProofError(ERROR_TEXT.crypto_hash);
      return;
    }
    setSubmitting(true);
    setProofError("");
    try {
      const response = await fetch(`/api/crypto/orders/${activeOrder.id}/proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: value }),
        cache: "no-store",
      });
      const data = (await response.json().catch(() => ({}))) as { order?: CryptoOrderDTO; error?: string; code?: string };
      if (!response.ok || !data.order) {
        throw new Error((data.code && ERROR_TEXT[data.code]) || data.error || ERROR_TEXT.crypto);
      }
      setOrders((prev) => prev.map((o) => (o.id === data.order!.id ? data.order! : o)));
      setTxHash("");
    } catch (error) {
      setProofError(error instanceof Error ? error.message : ERROR_TEXT.crypto);
    } finally {
      setSubmitting(false);
    }
  }, [activeOrder, submitting, txHash]);

  const syncProviderOrder = useCallback(
    async (manual: boolean) => {
      if (!activeOrder || activeOrder.method !== "provider" || syncing) return;
      if (manual) {
        setSyncing(true);
        setSyncMessage("");
      }
      try {
        const response = await fetch(`/api/crypto/orders/${activeOrder.id}/sync`, { method: "POST", cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as { status?: string; error?: string };
        if (!response.ok || !data.status) throw new Error(data.error || "Status check failed.");
        // Refresh only this order from the list endpoint to avoid a full-page refresh jump.
        const list = await fetch("/api/crypto/orders", { cache: "no-store" });
        const listData = (await list.json().catch(() => ({}))) as { orders?: CryptoOrderDTO[] };
        if (list.ok && listData.orders) {
          setOrders(listData.orders.slice(0, 8));
        } else {
          setOrders((prev) => prev.map((o) => (o.id === activeOrder.id ? { ...o, status: data.status! } : o)));
        }
        if (manual) setSyncMessage(data.status === "paid" ? "Payment confirmed." : "Status refreshed.");
      } catch (error) {
        if (manual) setSyncMessage(error instanceof Error ? error.message : "Status check failed.");
      } finally {
        if (manual) setSyncing(false);
      }
    },
    [activeOrder, syncing],
  );

  // Background status checks update only local order state; never router.refresh(),
  // so the page does not jump while the student is reading or typing.
  useEffect(() => {
    if (!activeOrder || activeOrder.method !== "provider" || !POLLABLE_PROVIDER.has(activeOrder.status)) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/crypto/orders/${activeOrder.id}/sync`, { method: "POST", cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as { status?: string };
        if (!cancelled && response.ok && data.status && data.status !== activeOrder.status) {
          const list = await fetch("/api/crypto/orders", { cache: "no-store" });
          const listData = (await list.json().catch(() => ({}))) as { orders?: CryptoOrderDTO[] };
          if (!cancelled && list.ok && listData.orders) setOrders(listData.orders.slice(0, 8));
        }
      } catch {
        // Silent background poll; manual check surfaces errors.
      }
    };
    const first = window.setTimeout(poll, 15000);
    const timer = window.setInterval(poll, 30000);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [activeOrder]);

  // Poll direct orders awaiting admin review so approval appears without a page reload.
  useEffect(() => {
    if (!activeOrder || activeOrder.method !== "direct" || (activeOrder.status !== "pending_review" && activeOrder.status !== "awaiting_payment")) {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const list = await fetch("/api/crypto/orders", { cache: "no-store" });
        const data = (await list.json().catch(() => ({}))) as { orders?: CryptoOrderDTO[] };
        if (!cancelled && list.ok && data.orders) {
          const fresh = data.orders.find((o) => o.id === activeOrder.id);
          if (fresh && fresh.status !== activeOrder.status) setOrders(data.orders.slice(0, 8));
        }
      } catch {
        // Silent background poll.
      }
    };
    const timer = window.setInterval(poll, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeOrder]);

  useEffect(() => {
    setTxHash("");
    setProofError("");
    setSyncMessage("");
  }, [activeId]);

  if (!anyProvider && !anyDirect) {
    return (
      <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        No crypto network is enabled. An administrator must configure receiving addresses or gateway credentials in Admin → Crypto Settings.
      </p>
    );
  }

  const history = orders.filter((o) => o.id !== activeId);
  const step = !activeOrder ? 1 : activeOrder.status === "paid" ? 3 : 2;

  return (
    <div className="mt-5 scroll-mt-24" id="crypto-topup">
      {/* Fixed-height stepper prevents layout jumps between steps. */}
      <ol className="grid min-h-[54px] grid-cols-3 gap-2" aria-label="Crypto top-up steps">
        {["Choose", activeOrder?.method === "provider" ? "Pay invoice" : "Send", "Done"].map((label, index) => {
          const number = index + 1;
          const done = number < step || (activeOrder?.status === "paid" && number <= 3);
          const current = number === step && activeOrder?.status !== "paid";
          return (
            <li
              key={label}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${
                done ? "border-teal-200 bg-teal-50 text-teal-800" : current ? "border-teal-700 bg-teal-800 text-white" : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${done || current ? "bg-white/20" : "bg-slate-100"}`}>
                {done ? "✓" : number}
              </span>
              <span className="truncate">
                {number}. {label}
              </span>
            </li>
          );
        })}
      </ol>

      {!activeOrder && (
        <div className="mt-4 rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Payment method">
            <button
              type="button"
              role="tab"
              aria-selected={method === "direct"}
              disabled={!anyDirect}
              onClick={() => setMethod("direct")}
              className={`h-10 min-w-[150px] flex-1 rounded-xl px-4 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                method === "direct" ? "bg-teal-800 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-teal-300"
              }`}
            >
              Manual · admin approval
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={method === "provider"}
              disabled={!anyProvider}
              onClick={() => setMethod("provider")}
              className={`h-10 min-w-[150px] flex-1 rounded-xl px-4 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                method === "provider" ? "bg-teal-800 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-teal-300"
              }`}
            >
              Automatic gateway
            </button>
          </div>

          <p className="mt-3 text-xs font-bold text-slate-600">Amount</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Top-up amount">
            {AMOUNTS.map((amount) => (
              <button
                key={amount}
                type="button"
                role="radio"
                aria-checked={amountUsd === amount}
                onClick={() => setAmountUsd(amount)}
                className={`h-12 rounded-xl border text-sm font-bold transition ${
                  amountUsd === amount ? "border-teal-700 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-700 hover:border-teal-300"
                }`}
              >
                {money(amount)}
              </button>
            ))}
          </div>

          {method === "provider" && (
            <>
              <p className="mt-4 text-xs font-bold text-slate-600">Provider</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["nowpayments", "plisio"] as const).map((name) => {
                  const available = name === "nowpayments" ? nowConfigured && networks.some((n) => n.nowpaymentsEnabled) : plisioConfigured && networks.some((n) => n.plisioEnabled);
                  return (
                    <button
                      key={name}
                      type="button"
                      disabled={!available}
                      aria-pressed={provider === name}
                      onClick={() => setProvider(name)}
                      className={`h-10 rounded-xl border text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        provider === name ? "border-teal-700 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600 hover:border-teal-300"
                      }`}
                    >
                      {name === "nowpayments" ? "NOWPayments" : "Plisio"}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <p className="mt-4 text-xs font-bold text-slate-600">Coin / network</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {methodOptions.map((network) => (
              <button
                key={network.asset}
                type="button"
                aria-pressed={selectedAsset === network.asset}
                onClick={() => setAsset(network.asset)}
                className={`min-h-[56px] rounded-xl border p-3 text-left transition ${
                  selectedAsset === network.asset ? "border-teal-700 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-300"
                }`}
              >
                <span className="block text-xs font-bold text-slate-800">{network.label}</span>
                <span className="mt-1 block text-[11px] text-slate-500">{network.network}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void createOrder()}
            disabled={creating || !selectedAsset}
            className="mt-4 h-12 w-full rounded-xl bg-teal-800 px-5 text-sm font-bold text-white transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Creating secure request…" : "Create direct transfer request"}
          </button>
          <div aria-live="polite" className="mt-2 min-h-[20px]">
            {formError && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {formError}
              </p>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">
            {method === "direct"
              ? "You will get one address and one exact amount. Send once, then paste the transaction hash on the next step."
              : "Send the exact amount shown by the provider on the selected network. Wallet credit follows a signed confirmation."}
          </p>
        </div>
      )}

      {activeOrder && (
        <div ref={activePanelRef} className="mt-4 min-h-[380px] scroll-mt-24 rounded-2xl border border-teal-700/30 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-teal-950">
                Payment #{activeOrder.id} · {money(activeOrder.amountUsd)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {providerLabel(activeOrder.provider)} · {activeOrder.asset.toUpperCase()} · {activeOrder.network}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${statusPill(displayStatus)}`}>{displayStatus.replaceAll("_", " ")}</span>
          </div>

          {activeOrder.payAddress && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-slate-500">Send to this address</p>
                <CopyTextButton value={activeOrder.payAddress} />
              </div>
              <code className="mt-1 block break-all text-xs font-semibold text-slate-800">{activeOrder.payAddress}</code>
              {activeOrder.payAmount ? (
                <p className="mt-2 text-xs text-slate-600">
                  Send exactly <b>{activeOrder.payAmount} {coinOf(activeOrder.asset)}</b> on <b>{activeOrder.network}</b>.
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-600">Open the provider invoice for the exact amount and instructions.</p>
              )}
              {activeOrder.expiresAt && (
                <div className="mt-2">
                  <p className="text-[11px] font-semibold text-amber-700">
                    {remaining === "expired" ? "This quote has expired." : remaining ? `Quote expires in ${remaining}` : "Quote expiry applies."}
                  </p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-amber-100">
                    <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: remaining === "expired" ? "0%" : "100%" }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeOrder.checkoutUrl && (
            <a href={activeOrder.checkoutUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-11 items-center rounded-xl bg-teal-800 px-4 text-xs font-bold text-white hover:bg-teal-900">
              Open payment invoice ↗
            </a>
          )}
          {activeOrder.qrCode.startsWith("data:image/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={activeOrder.qrCode} alt="Crypto payment QR code" className="mt-3 h-36 w-36 rounded-xl border border-slate-200 bg-white p-2" />
          )}

          {activeOrder.method === "direct" && displayStatus === "awaiting_payment" && (
            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submitProof();
              }}
            >
              <label className="block text-xs font-semibold text-slate-600" htmlFor={`txhash-${activeOrder.id}`}>
                Step 3 · Paste the blockchain transaction hash
                <input
                  id={`txhash-${activeOrder.id}`}
                  name="txHash"
                  value={txHash}
                  onChange={(event) => setTxHash(event.target.value)}
                  required
                  minLength={64}
                  maxLength={66}
                  pattern="(?:0x)?[A-Fa-f0-9]{64}"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="64 hex characters; 0x prefix accepted"
                  className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-xs outline-none focus:border-teal-500"
                />
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="mt-3 h-12 w-full rounded-xl border border-teal-800 px-4 text-sm font-bold text-teal-900 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[240px]"
              >
                {submitting ? "Submitting…" : "Submit for admin approval"}
              </button>
              <div aria-live="polite" className="mt-2 min-h-[20px]">
                {proofError && (
                  <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    {proofError}
                  </p>
                )}
              </div>
            </form>
          )}

          {activeOrder.method === "provider" && POLLABLE_PROVIDER.has(activeOrder.status) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void syncProviderOrder(true)}
                disabled={syncing}
                className="h-10 min-w-[150px] rounded-xl border border-teal-200 px-4 text-xs font-bold text-teal-800 transition hover:bg-teal-50 disabled:opacity-50"
              >
                {syncing ? "Checking…" : "Check status"}
              </button>
              <span role="status" className="min-h-[16px] text-[11px] text-slate-500">
                {syncMessage || "Status updates automatically; no need to reload the page."}
              </span>
            </div>
          )}

          <div aria-live="polite" className="mt-3 min-h-[22px]">
            {displayStatus === "pending_review" && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                Your transfer is waiting for administrator verification. Wallet credit is not available yet.
              </p>
            )}
            {displayStatus === "partially_paid" && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                The provider reported less than the requested amount. Your wallet has not been credited; contact support with payment #{activeOrder.id}.
              </p>
            )}
            {displayStatus === "paid" && (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">Payment confirmed. Your wallet has been credited.</p>
            )}
            {displayStatus === "expired" && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                This quote expired before funds were received. Please start a new request; do not send to the old address.
              </p>
            )}
          </div>
          {activeOrder.adminNote && <p className="mt-2 text-xs text-slate-500">Admin note: {activeOrder.adminNote}</p>}

          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => setActiveId(null)}
              className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
            >
              Start a new top-up
            </button>
            {displayStatus === "paid" || displayStatus === "expired" || displayStatus === "rejected" || displayStatus === "failed" ? (
              <span className="inline-flex h-10 items-center px-2 text-[11px] text-slate-400">This request is closed. Your balance and history below are unchanged by this panel.</span>
            ) : (
              <span className="inline-flex h-10 items-center px-2 text-[11px] text-slate-400">Keep this page open; approval appears here automatically.</span>
            )}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <details className="mt-4 rounded-2xl border border-slate-200 bg-white">
          <summary className="cursor-pointer list-none px-4 py-3 text-xs font-bold text-slate-600 hover:text-teal-800">
            Previous requests ({history.length}) · collapsed to keep this page stable
          </summary>
          <div className="space-y-2 border-t border-slate-100 p-3">
            {history.map((order) => (
              <div key={order.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <p className="min-w-0 truncate text-xs text-slate-600">
                  <b className="text-slate-800">#{order.id}</b> · {money(order.amountUsd)} · {providerLabel(order.provider)} ·{" "}
                  <span className="font-semibold">{order.status.replaceAll("_", " ")}</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(order.id);
                    scrollToActive();
                  }}
                  className="h-8 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold text-teal-800 hover:bg-teal-50"
                >
                  View
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
