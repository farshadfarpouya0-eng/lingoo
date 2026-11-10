"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { registerDailyWebhooks, saveIntegrationProvider, testIntegrationProvider } from "@/lib/integration-config";

type Provider = "email" | "storage" | "payments" | "cryptoPayments" | "video" | "zoom" | "recording" | "realtime" | "rateLimit";
function safeMessage(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message : fallback;
  // Database driver errors contain the SQL and its parameters; never put those in a URL.
  if (/failed query|relation .* does not exist|ECONNREFUSED|connect /i.test(text)) return "Could not reach the database or the site_settings table is missing. Run the database migrations (npm run db:migrate) and try again.";
  return text;
}
const validProvider = (v: string): v is Provider => ["email", "storage", "payments", "cryptoPayments", "video", "zoom", "recording", "realtime", "rateLimit"].includes(v);
export async function saveProviderIntegration(fd: FormData) {
  await requireAdmin();
  const provider = String(fd.get("provider") || "");
  if (!validProvider(provider)) redirect("/admin/integrations?result=invalid");
  let failure = "";
  try { await saveIntegrationProvider(provider, fd); }
  catch (error) { failure = safeMessage(error, "Could not save settings."); }
  if (failure) redirect(`/admin/integrations?result=error&provider=${provider}&message=${encodeURIComponent(failure.slice(0, 220))}#provider-${provider}`);
  revalidatePath("/admin/integrations");
  revalidatePath("/admin/settings");
  redirect(`/admin/integrations?result=saved&provider=${provider}#provider-${provider}`);
}
export async function testProviderIntegration(fd: FormData) {
  await requireAdmin();
  const provider = String(fd.get("provider") || "");
  if (!validProvider(provider)) redirect("/admin/integrations?result=invalid");
  let failure = "";
  try { await testIntegrationProvider(provider); }
  catch (error) { failure = safeMessage(error, "Connection test failed."); }
  if (failure) redirect(`/admin/integrations?result=test_error&provider=${provider}&message=${encodeURIComponent(failure.slice(0, 220))}#provider-${provider}`);
  redirect(`/admin/integrations?result=test_ok&provider=${provider}#provider-${provider}`);
}

export async function registerDailyWebhookAction() {
  await requireAdmin();
  let failure = "";
  try { await registerDailyWebhooks(); }
  catch (error) { failure = error instanceof Error ? error.message : "Could not register Daily webhook."; }
  if (failure) redirect(`/admin/integrations?result=webhook_error&message=${encodeURIComponent(failure.slice(0, 180))}`);
  revalidatePath("/admin/integrations");
  redirect("/admin/integrations?result=webhook_ok");
}
