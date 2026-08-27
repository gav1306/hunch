import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { computeBelief } from "@/lib/bayes";
import { pickPrimary, primaryBeliefRows } from "@/lib/parameters";
import { currentPhase } from "@/lib/schedule";
import { checkInValuesInputSchema, validateParameterValue } from "@/lib/schemas/parameter";
import type { ParameterType } from "@/lib/schemas/parameter";
import { parseStoredDesign } from "@/lib/schemas/protocol";

/** UTC calendar date (midnight) for today — the per-day check-in bucket. */
function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Phase 4: log today's readings. The server derives the phase from the schedule
 * (never trusts the client), refuses washout / pre-start / post-end days, and
 * upserts one CheckIn bucket per UTC day with one CheckInValue per parameter the
 * client sent. Partial payloads are fine; every value is validated against its
 * own parameter before anything is written. Returns the recomputed belief (from
 * the primary parameter only) so the meter narrows immediately.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: { hypothesis: true, protocol: true, parameters: true },
  });
  if (!hunch || !hunch.hypothesis) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }
  if (hunch.status !== "running" || !hunch.protocol?.startedAt || hunch.protocol.safetyState !== "approved") {
    return NextResponse.json({ error: "This hunch is not running yet." }, { status: 409 });
  }

  const parsed = checkInValuesInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "A check-in needs at least one reading." }, { status: 400 });
  }

  // Validate everything before writing anything — a rejected day writes no rows.
  const byId = new Map(hunch.parameters.map((p) => [p.id, p]));
  for (const row of parsed.data.values) {
    const param = byId.get(row.parameterId);
    if (!param) {
      return NextResponse.json({ error: "That isn't something this hunch tracks." }, { status: 400 });
    }
    const problem = validateParameterValue(
      { label: param.label, type: param.type as ParameterType, min: param.min, max: param.max },
      row.value,
    );
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }
  }

  const design = parseStoredDesign(hunch.protocol.design, hunch.hypothesis.outcomeMetric);
  const status = currentPhase(hunch.protocol.startedAt, design, new Date());
  if (status.done) {
    return NextResponse.json({ error: "This trial is complete." }, { status: 409 });
  }
  if (status.washout || status.phase === null) {
    return NextResponse.json({ error: "Today is a rest day — nothing to log." }, { status: 409 });
  }

  const loggedOn = utcToday();
  const checkIn = await db.checkIn.upsert({
    where: { hunchId_loggedOn: { hunchId: hunch.id, loggedOn } },
    create: { hunchId: hunch.id, phase: status.phase, loggedOn },
    update: { phase: status.phase },
  });

  // Re-tapping a parameter overwrites today's reading for it; parameters the
  // user left blank keep whatever they already had.
  for (const row of parsed.data.values) {
    await db.checkInValue.upsert({
      where: { checkInId_parameterId: { checkInId: checkIn.id, parameterId: row.parameterId } },
      create: { checkInId: checkIn.id, parameterId: row.parameterId, value: row.value },
      update: { value: row.value },
    });
  }

  const all = await db.checkIn.findMany({
    where: { hunchId: hunch.id },
    select: { phase: true, values: { select: { parameterId: true, value: true } } },
  });
  const primary = pickPrimary(hunch.parameters);
  const belief = computeBelief(
    primaryBeliefRows(all, primary?.id),
    (primary?.type ?? hunch.hypothesis.outcomeType) as "binary" | "continuous",
  );

  return NextResponse.json({ checkIn, belief }, { status: 201 });
}
