import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { timed, withTiming } from "@/lib/timing";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { exposureReport, pickExposure, pickPrimary } from "@/lib/parameters";
import { verdictSchema, type ExposureReport, type Verdict } from "@/lib/schemas/verdict";
import { parseStoredDesign } from "@/lib/schemas/protocol";
import { localToday, userTimeZone } from "@/lib/zone";
import { concludeTrial, VERDICT_INCLUDE, type VerdictRow } from "@/lib/conclude-trial";

/**
 * Shape a persisted Verdict row into the API DTO (ciLow/ciHigh -> ci tuple).
 *
 * `outcome` is not stored on the verdict: it is the primary parameter, read
 * from the hunch on every request. The headline names what moved, and the
 * label the user sees on the check-in screen is the name they know it by.
 * `exposure` isn't stored either, and for the same reason — see
 * `exposureReport` below.
 */
function toDto(
  row: VerdictRow,
  outcome: { label: string; unit?: string } | null,
  exposure: ExposureReport | null,
): Verdict {
  return verdictSchema.parse({
    category: row.category,
    outcome,
    narrative: row.narrative,
    pEffect: row.pEffect,
    effect: row.effect,
    ci: [row.ciLow, row.ciHigh],
    nA: row.nA,
    nB: row.nB,
    model: row.model,
    exposure,
  });
}

/**
 * Phase 5: the frozen verdict. Returns the stored verdict if it exists; otherwise,
 * once the ABA schedule has ended, computes the belief, classifies it, has the
 * Analyst narrate it, persists the snapshot, flips the hunch to "concluded", and
 * returns it. Still-running trials get 409 and keep showing the live meter.
 */
async function readVerdict(
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
      include: VERDICT_INCLUDE,
    }),
  );
  if (!hunch || !hunch.hypothesis) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }

  const primary = pickPrimary(hunch.parameters);
  const outcome = primary
    ? { label: primary.label, unit: primary.unit ?? undefined }
    : null;
  const exposureParam = pickExposure(hunch.parameters);
  // The report is read from the check-ins on every request, like `outcome` —
  // never frozen into the row, so a correction through the adherence strip
  // moves it immediately instead of leaving a stale count under the verdict.
  // A hunch with no protocol at all has no shape to speak of; treat it as
  // "phased" (mirrors the belief route's fallback).
  const design = hunch.protocol
    ? parseStoredDesign(hunch.protocol.design, hunch.hypothesis.outcomeMetric)
    : null;
  const report = exposureReport(hunch.checkIns, exposureParam, design?.shape ?? "phased");

  if (hunch.verdict) {
    return NextResponse.json({ verdict: toDto(hunch.verdict, outcome, report) });
  }

  const result = await concludeTrial(
    hunch,
    session.user.id,
    localToday(await userTimeZone(session.user.id)),
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    verdict: result.fresh ? { ...result.fresh, exposure: report } : toDto(result.row, outcome, report),
  });
}

export const GET = withTiming(readVerdict);
