import { getUser } from "@/lib/auth";
import { submitCryptoProof } from "@/lib/crypto-orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

const STATUS_BY_CODE: Record<string, number> = {
  rate: 429,
  crypto_setup: 503,
  crypto_duplicate: 409,
  crypto_submitted: 409,
  crypto_expired: 410,
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user || user.role !== "student") return Response.json({ error: "Sign in first." }, { status: 401, headers });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Payment not found.", code: "crypto" }, { status: 404, headers });
  let body: { txHash?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request.", code: "crypto_hash" }, { status: 400, headers });
  }
  try {
    const order = await submitCryptoProof(user.id, id, String(body.txHash || ""));
    return Response.json({ order }, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "crypto";
    return Response.json({ error: "Could not submit this transfer.", code }, { status: STATUS_BY_CODE[code] || 400, headers });
  }
}
