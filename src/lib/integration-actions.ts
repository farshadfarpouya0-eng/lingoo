"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { registerDailyWebhooks, saveIntegrationProvider, testIntegrationProvider } from "@/lib/integration-config";

type Provider = "email" | "storage" | "payments" | "video" | "recording" | "realtime" | "rateLimit";
const validProvider = (v: string): v is Provider => ["email", "storage", "payments", "video", "recording", "realtime", "rateLimit"].includes(v);
export async function saveProviderIntegration(fd: FormData) {
  await requireAdmin();
  const provider = String(fd.get("provider") || "");
  if (!validProvider(provider)) redirect("/admin/integrations?result=invalid");
  let failure = "";
  try { await saveIntegrationProvider(provider, fd); }
  catch (error) { failure = error instanceof Error ? error.message : "Could not save settings."; }
  if (failure) redirect(`/admin/integrations?result=error&provider=${provider}&message=${encodeURIComponent(failure.slice(0, 180))}`);
  revalidatePath("/admin/integrations");
  revalidatePath("/admin/settings");
  redirect(`/admin/integrations?result=saved&provider=${provider}`);
}
export async function testProviderIntegration(fd: FormData) {
  await requireAdmin();
  const provider = String(fd.get("provider") || "");
  if (!validProvider(provider)) redirect("/admin/integrations?result=invalid");
  let failure = "";
  try { await testIntegrationProvider(provider); }
  catch (error) { failure = error instanceof Error ? error.message : "Connection test failed."; }
  if (failure) redirect(`/admin/integrations?result=test_error&provider=${provider}&message=${encodeURIComponent(failure.slice(0, 180))}`);
  redirect(`/admin/integrations?result=test_ok&provider=${provider}`);
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
