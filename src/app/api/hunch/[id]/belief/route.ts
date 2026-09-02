import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { computeBelief } from "@/lib/bayes";
import {
  activeParameters,
  engineOutcomeType,
  pickPrimary,
  primaryBeliefRows,
  toParameterDto,
} from "@/lib/parameters";
import { currentPhase } from "@/lib/schedule";
import { parseStoredDesign } from "@/lib/schemas/protocol";

/**
 * Phase 4: compute-on-read belief. Reads every check-in for the hunch, runs the
 * Bayesian engine fresh, and returns the posterior plus today's schedule so the
 * UI knows whether logging is open. No stored snapshots.
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
      checkIns: {
        orderBy: { loggedOn: "asc" },
        include: { values: { select: { parameterId: true, value: true } } },
      },
    },
  });
  if (!hunch || !hunch.hypothesis) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }

  const primary = pickPrimary(hunch.parameters);
  const outcomeType = engineOutcomeType(primary?.type ?? hunch.hypothesis.outcomeType);
  const belief = computeBelief(primaryBeliefRows(hunch.checkIns, primary?.id), outcomeType);

  let schedule = null;
  if (hunch.protocol?.startedAt) {
    const design = parseStoredDesign(hunch.protocol.design, hunch.hypothesis.outcomeMetric);
    schedule = currentPhase(hunch.protocol.startedAt, design, new Date());
  }

  return NextResponse.json({
    belief,
    // Retired trackers keep their history but stop being asked for, so the
    // check-in this feeds renders only what is still live.
    parameters: activeParameters(hunch.parameters).map(toParameterDto),
    checkIns: hunch.checkIns.map((c) => ({
      phase: c.phase,
      loggedAt: c.loggedAt,
      // The calendar day the entry belongs to — what the adherence strip keys
      // on. `loggedAt` is the wall clock it was typed at, which is a different
      // day either side of midnight.
      loggedOn: c.loggedOn.toISOString(),
      values: c.values.map((v) => ({ parameterId: v.parameterId, value: v.value })),
    })),
    schedule,
    // The anchor itself, so a trial the user scheduled for tomorrow can say
    // when it begins rather than just reporting that it hasn't.
    startsOn: hunch.protocol?.startedAt?.toISOString() ?? null,
  });
}
