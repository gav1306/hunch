import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ProtocolView } from "@/components/hunch/protocol-view";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { pageTitle } from "@/lib/titles";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await getSession(await headers());
  if (!session) return { title: "The plan" };

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    select: { rawText: true, hypothesis: { select: { statement: true } } },
  });
  if (!hunch) return { title: "The plan" };

  return { title: `Plan · ${pageTitle(hunch.hypothesis?.statement ?? hunch.rawText)}` };
}

export default async function ProtocolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession(await headers());
  if (!session) redirect("/signin");

  const { id } = await params;
  const exists = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!exists) notFound();

  return <ProtocolView id={id} />;
}
