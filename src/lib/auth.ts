import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";

const SESSION_DAYS = 14;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}
const DUMMY = hashPassword("dummy-password-for-timing");
export function verifyPassword(pw: string, stored: string | null) {
  const [salt, hash] = (stored ?? DUMMY).split(":");
  if (!salt || !hash) return false;
  const b = Buffer.from(hash, "hex");
  const a = scryptSync(pw, salt, b.length);
  return timingSafeEqual(a, b) && stored !== null;
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({ id: sha(token), userId, expiresAt });
  (await cookies()).set("sid", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get("sid")?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha(token)));
  jar.delete("sid");
}

/** Cached per request so layout + page share a single query. */
export const getUser = cache(async (options?: { includeSuspended?: boolean }) => {
  const token = (await cookies()).get("sid")?.value;
  if (!token || token.length > 100) return null;
  const [row] = await db
    .select({ u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(options?.includeSuspended
      ? and(eq(sessions.id, sha(token)), gt(sessions.expiresAt, new Date()))
      : and(eq(sessions.id, sha(token)), gt(sessions.expiresAt, new Date()), eq(users.suspended, false)));
  if (!row || (row.u.suspended && !options?.includeSuspended)) return null;
  return row.u;
});
export type User = NonNullable<Awaited<ReturnType<typeof getUser>>>;

export async function requireAdmin() {
  const u = await getUser();
  if (!u || u.role !== "admin") throw new Error("Forbidden");
  return u;
}
