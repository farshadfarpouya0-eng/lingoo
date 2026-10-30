export function isAccountSuspended(suspended: boolean, suspendedUntil: Date | string | null | undefined, now = Date.now()) {
  if (!suspended) return false;
  if (!suspendedUntil) return true;
  const until = suspendedUntil instanceof Date ? suspendedUntil.getTime() : new Date(suspendedUntil).getTime();
  return !Number.isFinite(until) || until > now;
}
