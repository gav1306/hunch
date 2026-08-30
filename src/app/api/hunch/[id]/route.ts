import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { toParameterDto } from "@/lib/parameters";
import { parseStoredDesign } from "@/lib/schemas/protocol";

/**
 * Lightweight read of a hunch for the protocol page: the sharpened hypothesis
 * (shown in the confirm step before we spend ~20s designing) and the existing
 * protocol, if one was already designed, so a revisit skips straight to the plan.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: {
      hypothesis: true,
      protocol: true,
      parameters: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!hunch || !hunch.hypothesis) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }

  const p = hunch.protocol;
  return NextResponse.json({
    // The words the user actually typed. Re-sharpening reloads them rather than
    // dropping the user on a blank page with their original hunch lost.
    rawText: hunch.rawText,
    status: hunch.status,
    archivedAt: hunch.archivedAt ? hunch.archivedAt.toISOString() : null,
    hypothesis: {
      statement: hunch.hypothesis.statement,
      outcomeMetric: hunch.hypothesis.outcomeMetric,
      // The gate needs this to seed a primary row for pre-migration hunches.
      outcomeType: hunch.hypothesis.outcomeType,
    },
    parameters: hunch.parameters.map(toParameterDto),
    protocol: p
      ? {
          id: p.id,
          safetyState: p.safetyState,
          // Protocols designed before phases carried a name/action still have to
          // render, so the stored design goes through the same tolerant parse
          // every other read path uses.
          design: parseStoredDesign(p.design, hunch.hypothesis.outcomeMetric),
          powerInfo: p.powerInfo,
          confounders: p.confounders,
        }
      : null,
  });
}

/**
 * Abandon a hunch and everything hanging off it.
 *
 * There was no delete anywhere in the app. A hunch the user gave up on sat in
 * "Finish setting up" permanently, and a concluded one sat on home forever, so
 * after a few experiments home was mostly history the user couldn't clear.
 *
 * Protocol, parameters, check-ins and the verdict all cascade from the Hunch
 * row, so this is a single delete rather than a hand-rolled teardown.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  // Scoped to the owner: deleteMany rather than delete, so another user's id
  // reports "not found" instead of throwing on a row they can't see.
  const { count } = await db.hunch.deleteMany({ where: { id, userId: session.user.id } });
  if (count === 0) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }

  return NextResponse.json({ deleted: id });
}
