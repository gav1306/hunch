import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { timed, withTiming } from "@/lib/timing";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { computeBelief } from "@/lib/bayes";
import {
  activeParameters,
  armRows,
  engineOutcomeType,
  exposureReport,
  pickExposure,
  pickPrimary,
  toParameterDto,
} from "@/lib/parameters";
import { currentPhase } from "@/lib/schedule";
import { parseStoredDesign } from "@/lib/schemas/protocol";

/**
 * Phase 4: compute-on-read belief. Reads every check-in for the hunch, runs the
 * Bayesian engine fresh, and returns the posterior plus today's schedule so the
 * UI knows whether logging is open. No stored snapshots.
 */
async function readBelief(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const hunch = await timed("db-load", () =>
    db.hunch.findFirst({
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
    }),
  );
  if (!hunch || !hunch.hypothesis) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }

  const primary = pickPrimary(hunch.parameters);
  const outcomeType = engineOutcomeType(primary?.type ?? hunch.hypothesis.outcomeType);
  // A hunch with no protocol yet has no shape to speak of — treat it as
  // "phased" so the belief falls back to today's byte-for-byte behaviour.
  const design = hunch.protocol
    ? parseStoredDesign(hunch.protocol.design, hunch.hypothesis.outcomeMetric)
    : null;
  const shape = design?.shape ?? "phased";
  const exposureParam = pickExposure(hunch.parameters);
  const belief = computeBelief(
    armRows(hunch.checkIns, primary?.id, { shape, exposureId: exposureParam?.id ?? null }),
    outcomeType,
  );

  let schedule = null;
  if (hunch.protocol?.startedAt && design) {
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
    // Computed from the check-ins on every request, exactly like the belief
    // above it — a frozen count would disagree the moment a user corrects a
    // day through the adherence strip.
    exposure: exposureReport(hunch.checkIns, exposureParam, shape),
  });
}

export const GET = withTiming(readBelief);
