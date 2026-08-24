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
