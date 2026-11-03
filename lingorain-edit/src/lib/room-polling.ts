import type { RoomSnapshot } from "./room-service";

/** Keep active-class switches fast; waiting rooms poll less and ended rooms stop. */
export function roomPollDelay(state: RoomSnapshot["state"], failures = 0) {
  if (state === "closed") return 0;
  const normal = state === "open" ? 4000 : 10000;
  return Math.min(30000, normal * 2 ** Math.min(3, Math.max(0, failures)));
}
