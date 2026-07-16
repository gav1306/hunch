import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NewHunchForm } from "@/components/hunch/new-hunch-form";
import { auth } from "@/lib/auth";
import { parseSeed } from "@/lib/seed";

export default async function NewHunchPage({
  searchParams,
}: {
  searchParams: Promise<{ seed?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/signin");

  const { seed } = await searchParams;
  return <NewHunchForm seed={parseSeed(seed)} />;
}
