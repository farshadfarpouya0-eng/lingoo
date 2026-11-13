import { getUser } from "@/lib/auth";
import { createCryptoOrder, listMyCryptoOrders } from "@/lib/crypto-orders";
import { isCryptoPaymentsSchemaReady } from "@/lib/crypto-schema";
import { isCryptoSettingsReady } from "@/lib/crypto-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

const STATUS_BY_CODE: Record<string, number> = {
  rate: 429,
  crypto_setup: 503,
  crypto_config: 503,
  crypto_quote: 502,
  crypto_provider: 502,
  crypto_unavailable: 409,
};

export async function GET() {
  const user = await getUser();
  if (!user || user.role !== "student") return Response.json({ error: "Sign in first." }, { status: 401, headers });
  if (!(await isCryptoPaymentsSchemaReady()) || !(await isCryptoSettingsReady())) {
    return Response.json({ error: "Crypto payments are not initialized.", code: "crypto_setup" }, { status: 503, headers });
  }
  const orders = await listMyCryptoOrders(user.id, 8);
  return Response.json({ orders }, { headers });
}

export async function POST(request: Request) {
  const user = await getUser();
  if (!user || user.role !== "student") return Response.json({ error: "Sign in first." }, { status: 401, headers });
  let body: { amountUsd?: unknown; method?: unknown; provider?: unknown; asset?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid request.", code: "crypto" }, { status: 400, headers });
  }
  try {
    const order = await createCryptoOrder(user.id, {
      amountUsd: Number(body.amountUsd),
      method: String(body.method || ""),
      provider: String(body.provider || ""),
      asset: String(body.asset || ""),
    });
    return Response.json({ order }, { status: 201, headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "crypto";
    // Provider creation failures are stored as failed orders; surface them without a 500.
    if (code === "crypto_provider") {
      const orders = await listMyCryptoOrders(user.id, 8);
      return Response.json({ error: "The payment provider could not create this invoice.", code, orders }, { status: 502, headers });
    }
    return Response.json(
      { error: "Could not create this crypto payment.", code },
      { status: STATUS_BY_CODE[code] || 400, headers },
    );
  }
}
