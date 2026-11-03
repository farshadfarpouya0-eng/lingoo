import { createHmac, timingSafeEqual } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getIntegrationConfig } from "@/lib/integration-config";
import { ledgerOnce } from "@/lib/money";

export const dynamic = "force-dynamic";

function verify(payload: string, header: string | null, secret: string) {
  if (!header) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const item of header.split(",")) {
    const splitAt = item.indexOf("=");
    if (splitAt < 1) continue;
    const key = item.slice(0, splitAt).trim();
    const value = item.slice(splitAt + 1).trim();
    if (key === "t") timestamp = value;
    if (key === "v1" && /^[a-f0-9]{64}$/i.test(value)) signatures.push(value);
  }
  const timestampNumber = Number(timestamp);
  if (!timestamp || !Number.isSafeInteger(timestampNumber) || timestampNumber <= 0 || !signatures.length
    || Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest();
  return signatures.some(signature => {
    const supplied = Buffer.from(signature, "hex");
    return supplied.length === expected.length && timingSafeEqual(expected, supplied);
  });
}

export async function POST(req: Request) {
  const secret = (await getIntegrationConfig()).payments.webhookSecret;
  if (!secret) return new Response("not configured", { status: 404 });
  const payload = await req.text();
  if (!verify(payload, req.headers.get("stripe-signature"), secret)) return new Response("bad signature", { status: 400 });
  let event: {
    type: string;
    data?: { object?: { id?: string; payment_status?: string; amount_total?: number; currency?: string; metadata?: { user_id?: string; amount?: string } } };
  };
  try { event = JSON.parse(payload); } catch { return new Response("bad payload", { status: 400 }); }
  if (event.type === "checkout.session.completed" && event.data?.object?.payment_status === "paid") {
    const o = event.data?.object;
    const userId = Number(o?.metadata?.user_id);
    const amount = o?.amount_total ?? 0;
    const expectedAmount = Number(o?.metadata?.amount);
    // Only credit the exact USD amount initiated by the wallet top-up flow.
    // This prevents malformed/unexpected Checkout sessions from minting balance.
    if (o?.id && Number.isSafeInteger(userId) && userId > 0
      && [2000, 5000, 10000, 20000].includes(amount)
      && o.currency?.toLowerCase() === "usd" && expectedAmount === amount) {
      await db.transaction(async (tx) => {
        const [buyer] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId));
        if (!buyer || buyer.role !== "student") return;
        // Unique transaction reference makes webhook retries idempotent; the
        // wallet transaction and its balanced accounting entries are atomic.
        const inserted = await ledgerOnce(tx, userId, "topup", amount, "Stripe top-up", `stripe:${o.id}`);
        if (inserted) await tx.update(users).set({ balance: sql`${users.balance} + ${amount}` }).where(eq(users.id, userId));
      });
    }
  }
  return Response.json({ received: true });
}
