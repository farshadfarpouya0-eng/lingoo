import type { CryptoOrderDTO } from "./crypto-orders";

export function cryptoDisplayStatus(order: Pick<CryptoOrderDTO, "status" | "expiresAt">, now: number) {
  // A quote deadline is not a failed/expired transfer: submitted or confirming
  // payments must retain their real server status and must never invite a second payment.
  const awaiting = ["awaiting_payment", "pending", "creating"].includes(order.status);
  return awaiting && order.expiresAt && Date.parse(order.expiresAt) <= now ? "expired" : order.status;
}
export function cryptoCheckoutStep(status?: string) {
  if (!status) return 1;
  return ["awaiting_payment", "pending", "creating"].includes(status) ? 2 : 3;
}
export function isCryptoActive(status: string) {
  return ["awaiting_payment", "pending", "creating", "confirming", "pending_review", "partially_paid"].includes(status);
}
