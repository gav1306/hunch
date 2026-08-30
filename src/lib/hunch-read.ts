import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

/** Enough of a hunch to prove the reader owns it and to name a browser tab. */
export type OwnedHunch = {
  id: string;
  rawText: string;
  /** Null until the hunch is sharpened — the tab falls back to the raw words. */
  statement: string | null;
};

/**
 * Read one hunch the signed-in user owns — once per request, however many
 * callers ask.
 *
 * `generateMetadata` and the segment that renders both need the same row: one
 * to title the tab, one to decide whether the hunch exists at all. Next only
 * memoizes `fetch`, not a Prisma call, so without `cache()` every dynamic hunch
 * screen made the same query twice. Returns null for a signed-out reader and
 * for an id belonging to someone else — the two are deliberately
 * indistinguishable to the caller.
 */
export const readOwnedHunch = cache(async (id: string): Promise<OwnedHunch | null> => {
  const session = await getSession(await headers());
  if (!session) return null;

  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, rawText: true, hypothesis: { select: { statement: true } } },
  });
  if (!hunch) return null;

  return {
    id: hunch.id,
    rawText: hunch.rawText,
    statement: hunch.hypothesis?.statement ?? null,
  };
});
