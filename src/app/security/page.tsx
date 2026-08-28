import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { ReminderSettings } from "@/components/app/reminder-settings";
import { SecuritySettings } from "@/components/app/security-settings";
import { getSession } from "@/lib/session";

export default async function SecurityPage() {
  const session = await getSession(await headers());
  if (!session) redirect("/signin");

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email }}>
      <div style={{ display: "grid", gap: "clamp(20px,3vh,32px)" }}>
        <SecuritySettings />
        <ReminderSettings />
      </div>
    </AppShell>
  );
}
