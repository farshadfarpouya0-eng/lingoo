"use server";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { authActionTokens, sessions, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { clientIp, hit } from "@/lib/ratelimit";
import { appBaseUrl, sendTransactionalEmail } from "@/lib/mailer";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase().slice(0, 254);

async function issueAndSend(user: { id: number; email: string; name: string }, purpose: "verify_email" | "reset_password") {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = sha(raw);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (purpose === "verify_email" ? 24 : 1) * 60 * 60_000);
  // Keep an existing usable link until the replacement email has actually been sent.
  await db.insert(authActionTokens).values({ userId: user.id, purpose, tokenHash, expiresAt });
  const path = purpose === "verify_email" ? "/verify-email" : "/reset-password";
  const link = `${appBaseUrl()}${path}?token=${encodeURIComponent(raw)}`;
  const subject = purpose === "verify_email" ? "Verify your Lingorain email" : "Reset your Lingorain password";
  const action = purpose === "verify_email" ? "verify your email address" : "set a new password";
  try {
    await sendTransactionalEmail({
      to: user.email,
      subject,
      text: `Hello ${user.name},\n\nUse this one-time link to ${action}:\n${link}\n\nThis link expires in ${purpose === "verify_email" ? "24 hours" : "1 hour"}. If you did not request this, you can ignore this email.\n\nLingorain`,
    });
  } catch (error) {
    await db.delete(authActionTokens).where(eq(authActionTokens.tokenHash, tokenHash)).catch(() => undefined);
    throw error;
  }
  await db.update(authActionTokens).set({ consumedAt: now }).where(and(
    eq(authActionTokens.userId, user.id), eq(authActionTokens.purpose, purpose),
    isNull(authActionTokens.consumedAt), ne(authActionTokens.tokenHash, tokenHash),
  ));
}

export async function sendVerificationForNewUser(userId: number) {
  const [user] = await db.select({ id: users.id, email: users.email, name: users.name, emailVerified: users.emailVerified })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.emailVerified) return false;
  await issueAndSend(user, "verify_email");
  return true;
}

export async function verifyEmailToken(rawToken: string) {
  if (!rawToken || rawToken.length < 30 || rawToken.length > 100) return false;
  const tokenHash = sha(rawToken);
  const now = new Date();
  return db.transaction(async tx => {
    const [token] = await tx.update(authActionTokens)
      .set({ consumedAt: now })
      .where(and(eq(authActionTokens.tokenHash, tokenHash), eq(authActionTokens.purpose, "verify_email"), isNull(authActionTokens.consumedAt), gt(authActionTokens.expiresAt, now)))
      .returning({ userId: authActionTokens.userId });
    if (!token) return false;
    await tx.update(users).set({ emailVerified: true }).where(eq(users.id, token.userId));
    return true;
  });
}

export async function confirmEmail(_prev: unknown, fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const verified = await verifyEmailToken(token);
  return verified ? { verified: true } : { error: "invalid" };
}

export async function resendVerification(_prev: unknown, fd: FormData) {
  const email = normalizeEmail(fd.get("email"));
  if (!emailPattern.test(email)) return { ok: true };
  const ip = await clientIp();
  if (!await hit(`verify-resend:ip:${ip}`, 12, 60 * 60_000)) return { ok: true };
  if (!await hit(`verify-resend:email:${sha(email)}`, 3, 60 * 60_000)) return { ok: true };
  const [user] = await db.select({ id: users.id, email: users.email, name: users.name, emailVerified: users.emailVerified })
    .from(users).where(eq(users.email, email)).limit(1);
  if (user && !user.emailVerified) {
    try { await issueAndSend(user, "verify_email"); } catch { /* Never disclose account existence or provider state. */ }
  }
  return { ok: true };
}

export async function requestPasswordReset(_prev: unknown, fd: FormData) {
  const email = normalizeEmail(fd.get("email"));
  if (!emailPattern.test(email)) return { ok: true };
  const ip = await clientIp();
  if (!await hit(`password-reset:ip:${ip}`, 12, 60 * 60_000)) return { ok: true };
  if (!await hit(`password-reset:email:${sha(email)}`, 3, 60 * 60_000)) return { ok: true };
  const [user] = await db.select({ id: users.id, email: users.email, name: users.name })
    .from(users).where(eq(users.email, email)).limit(1);
  if (user) {
    try { await issueAndSend(user, "reset_password"); } catch { /* Same response for unknown users and provider failures. */ }
  }
  return { ok: true };
}

export async function resetPassword(_prev: unknown, fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  if (password.length < 12 || password.length > 200) return { error: "password" };
  if (token.length < 30 || token.length > 100) return { error: "invalid" };
  const now = new Date();
  const tokenHash = sha(token);
  const ok = await db.transaction(async tx => {
    const [row] = await tx.update(authActionTokens).set({ consumedAt: now })
      .where(and(eq(authActionTokens.tokenHash, tokenHash), eq(authActionTokens.purpose, "reset_password"), isNull(authActionTokens.consumedAt), gt(authActionTokens.expiresAt, now)))
      .returning({ userId: authActionTokens.userId });
    if (!row) return false;
    await tx.update(users).set({ passwordHash: hashPassword(password), emailVerified: true }).where(eq(users.id, row.userId));
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
    return true;
  });
  if (!ok) return { error: "invalid" };
  redirect("/login?reset=1");
}
