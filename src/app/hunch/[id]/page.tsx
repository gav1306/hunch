import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HunchDashboard } from "@/components/hunch/hunch-dashboard";
import { readOwnedHunch } from "@/lib/hunch-read";
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
  const { id } = await params;
  const hunch = await readOwnedHunch(id);
  // The template appends " · hunch", so these fallbacks stay bare.
  if (!hunch) return { title: "Experiment" };

  return { title: pageTitle(hunch.statement ?? hunch.rawText) };
}

export default async function HunchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Ownership, existence and the signed-out redirect are all settled above this
  // segment's loading boundary — in `[id]/layout.tsx` and `/hunch/layout.tsx` —
  // so a mistyped id 404s with a real status code instead of a streamed 200.
  // This read is the same cached one the layout already did.
  const { id } = await params;
  const hunch = await readOwnedHunch(id);
  if (!hunch) notFound();

  // The hypothesis and the archived flag come down with the HTML rather than
  // from a second client query, so "What now" is on screen with the verdict
  // instead of appearing a beat later.
  return (
    <HunchDashboard
      id={id}
      statement={hunch.statement ?? undefined}
      archived={hunch.archived}
    />
  );
}
