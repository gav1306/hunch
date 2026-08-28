import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { getSession } from "@/lib/session";

/**
 * Every `/hunch/*` screen — new, protocol, dashboard — inside the slim shell.
 *
 * They each used to paint their own `<main>` and offer a 10.5px "← home" link
 * as the whole of their navigation, so the three screens a user spends the most
 * time on were the three with no way to reach sign-out or start a second hunch.
 * The session gate moves here too: it was repeated per page, and the pages that
 * were client components couldn't do it at all.
 */
export default async function HunchLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession(await headers());
  if (!session) redirect("/signin");

  return (
    <AppShell
      variant="slim"
      user={{ name: session.user.name, email: session.user.email }}
    >
      {children}
    </AppShell>
  );
}
