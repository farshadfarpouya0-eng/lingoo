import AuthForm from "@/components/AuthForm";
import { getT } from "@/lib/i18n";
import { ensureSeed } from "@/lib/seed";
import { demoDataEnabled } from "@/lib/runtime-policy";

export const dynamic = "force-dynamic";
export default async function Page() {
  await ensureSeed();
  const { t } = await getT();
  return <AuthForm mode="login" t={t} showDemo={demoDataEnabled()} />;
}
