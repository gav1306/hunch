import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { HunchDashboard } from "@/components/hunch/hunch-dashboard";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { pageTitle } from "@/lib/titles";

/**
 * The tab name is the hypothesis, not the product name. Three experiments open
 * at once used to be three tabs called "Hunch"; this is the only thing on the
 * page that tells them apart. Resolved on the server so the title is in the
 * HTML rather than swapped in after hydration.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await getSession(await headers());
  // The template appends " · hunch", so these fallbacks stay bare.
  if (!session) return { title: "Experiment" };

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    select: { rawText: true, hypothesis: { select: { statement: true } } },
  });
  if (!hunch) return { title: "Experiment" };

  return { title: pageTitle(hunch.hypothesis?.statement ?? hunch.rawText) };
}

export default async function HunchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession(await headers());
  if (!session) redirect("/signin");

  const { id } = await params;
  // A mistyped or deleted id renders the themed 404 rather than a dashboard
  // whose every query 404s underneath it.
  const exists = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!exists) notFound();

  return <HunchDashboard id={id} />;
}
