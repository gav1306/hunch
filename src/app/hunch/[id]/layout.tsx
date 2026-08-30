import { notFound } from "next/navigation";
import { readOwnedHunch } from "@/lib/hunch-read";

/**
 * The gate for every screen about one hunch — the dashboard and the plan.
 *
 * This check used to live inside each page, which looked equivalent and was
 * not: a segment's `loading.tsx` puts its page behind a Suspense boundary, so
 * React had already flushed the shell — and with it a `200` status line — by
 * the time the page called `notFound()`. The themed 404 rendered, but every
 * mistyped id answered `200 OK`, which is a lie to anything reading status
 * codes rather than pixels.
 *
 * A layout sits *outside* its own segment's loading boundary, and nothing above
 * this one streams, so throwing here still sets a real 404. The skeleton is
 * untouched: it covers the page below.
 *
 * The session guard stays in `/hunch/layout.tsx`, which redirects a signed-out
 * reader before this runs.
 */
export default async function HunchIdLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  if (!(await readOwnedHunch(id))) notFound();

  return <>{children}</>;
}
