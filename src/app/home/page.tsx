import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { HomeView } from "@/components/app/home-view";
import { auth } from "@/lib/auth";
import { getHomeData } from "@/lib/home";

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/signin");

  const data = await getHomeData(session.user.id);
  const user = { name: session.user.name, email: session.user.email };

  return (
    <AppShell user={user}>
      <HomeView user={user} data={data} />
    </AppShell>
  );
}
