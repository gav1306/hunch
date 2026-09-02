import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { computeBelief } from "@/lib/bayes";
import { engineOutcomeType, pickPrimary, primaryBeliefRows } from "@/lib/parameters";
import { currentPhase } from "@/lib/schedule";
import { classifyVerdict } from "@/lib/verdict";
import { writeEdgeData } from "@/lib/memory/causal-graph";
import { runAnalysis } from "@/mastra/workflows/analysis";
import { verdictSchema, type Verdict } from "@/lib/schemas/verdict";
import { parseStoredDesign } from "@/lib/schemas/protocol";

/**
 * Shape a persisted Verdict row into the API DTO (ciLow/ciHigh -> ci tuple).
 *
 * `outcome` is not stored on the verdict: it is the primary parameter, read
 * from the hunch on every request. The headline names what moved, and the
 * label the user sees on the check-in screen is the name they know it by.
 */
function toDto(
  row: {
    category: string; narrative: string; pEffect: number; effect: number;
    ciLow: number; ciHigh: number; nA: number; nB: number; model: string;
  },
  outcome: { label: string; unit?: string } | null,
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
  });
}

/**
 * Phase 5: the frozen verdict. Returns the stored verdict if it exists; otherwise,
 * once the ABA schedule has ended, computes the belief, classifies it, has the
 * Analyst narrate it, persists the snapshot, flips the hunch to "concluded", and
 * returns it. Still-running trials get 409 and keep showing the live meter.
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
      verdict: true,
      parameters: true,
      checkIns: {
        orderBy: { loggedAt: "asc" },
        include: { values: { select: { parameterId: true, value: true } } },
      },
    },
  });
  if (!hunch || !hunch.hypothesis) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }

  const primary = pickPrimary(hunch.parameters);
  const outcome = primary
    ? { label: primary.label, unit: primary.unit ?? undefined }
    : null;

  if (hunch.verdict) {
    return NextResponse.json({ verdict: toDto(hunch.verdict, outcome) });
  }

  if (!hunch.protocol?.startedAt) {
    return NextResponse.json({ error: "This trial hasn't started." }, { status: 409 });
  }

  const outcomeType = engineOutcomeType(primary?.type ?? hunch.hypothesis.outcomeType);
  const belief = computeBelief(primaryBeliefRows(hunch.checkIns, primary?.id), outcomeType);
  const design = parseStoredDesign(hunch.protocol.design, hunch.hypothesis.outcomeMetric);
  const schedule = currentPhase(hunch.protocol.startedAt, design, new Date());

  const category = classifyVerdict(belief, schedule);
  if (category === null) {
    return NextResponse.json({ error: "This trial is still running." }, { status: 409 });
  }

  let verdict;
  try {
    verdict = await runAnalysis({
      category,
      belief,
      statement: hunch.hypothesis.statement,
      outcomeMetric: hunch.hypothesis.outcomeMetric,
    });
  } catch {
    // The Analyst call (or its structured-output parse) failed. Nothing is
    // persisted, so the next read retries cleanly.
    return NextResponse.json(
      { error: "Could not generate your verdict. Please try again." },
      { status: 502 },
    );
  }

  const edgeInput = writeEdgeData({
    category: verdict.category,
    effect: verdict.effect,
    pEffect: verdict.pEffect,
    statement: hunch.hypothesis.statement,
    outcomeMetric: hunch.hypothesis.outcomeMetric,
    hunchId: hunch.id,
    userId: session.user.id,
  });

  try {
    await db.$transaction([
      db.verdict.create({
        data: {
          hunchId: hunch.id,
          category: verdict.category,
          narrative: verdict.narrative,
          pEffect: verdict.pEffect,
          effect: verdict.effect,
          ciLow: verdict.ci[0],
          ciHigh: verdict.ci[1],
          nA: verdict.nA,
          nB: verdict.nB,
          model: verdict.model,
        },
      }),
      db.hunch.update({ where: { id: hunch.id }, data: { status: "concluded" } }),
      ...(edgeInput ? [db.causalEdge.create({ data: edgeInput })] : []),
    ]);
  } catch {
    // A concurrent first-read won the race and already wrote the verdict (the
    // @@unique on hunchId rejects the second insert). Serve the stored one so
    // both requests see the same frozen verdict instead of a 500.
    const existing = await db.verdict.findUnique({ where: { hunchId: hunch.id } });
    if (existing) {
      return NextResponse.json({ verdict: toDto(existing, outcome) });
    }
    return NextResponse.json(
      { error: "Could not save your verdict. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ verdict });
}
