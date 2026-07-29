import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { SecuritySettings } from "@/components/app/security-settings";
import { getSession } from "@/lib/session";

export default async function SecurityPage() {
  const session = await getSession(await headers());
  if (!session) redirect("/signin");

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email }}>
      <SecuritySettings />
    </AppShell>
  );
}
