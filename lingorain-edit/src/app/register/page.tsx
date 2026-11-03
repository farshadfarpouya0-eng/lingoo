import AuthForm from "@/components/AuthForm";
import { getT } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ role?: string; ref?: string }> }) {
  const { t } = await getT();
  const { role, ref } = await searchParams;
  return <AuthForm mode="register" t={t} defaultRole={role} referralCode={ref || ""} />;
}
