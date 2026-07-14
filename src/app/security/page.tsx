import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { SecuritySettings } from "@/components/app/security-settings";
import { auth } from "@/lib/auth";

export default async function SecurityPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/signin");

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email }}>
      <SecuritySettings />
    </AppShell>
  );
}
