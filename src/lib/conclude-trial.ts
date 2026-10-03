import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { computeBelief } from "@/lib/bayes";
import { armRows, engineOutcomeType, pickExposure, pickPrimary } from "@/lib/parameters";
import { currentPhase } from "@/lib/schedule";
import { classifyVerdict } from "@/lib/verdict";
import { writeEdgeData } from "@/lib/memory/causal-graph";
import { runAnalysis } from "@/mastra/workflows/analysis";
import type { Verdict } from "@/lib/schemas/verdict";
import { parseStoredDesign } from "@/lib/schemas/protocol";

/** Everything concluding a trial reads. The verdict route loads the hunch with it too. */
export const VERDICT_INCLUDE = {
  hypothesis: true,
  protocol: true,
  verdict: true,
  parameters: true,
  checkIns: {
    orderBy: { loggedAt: "asc" },
    include: { values: { select: { parameterId: true, value: true } } },
  },
} as const satisfies Prisma.HunchInclude;

export type VerdictHunch = Prisma.HunchGetPayload<{ include: typeof VERDICT_INCLUDE }>;

/** The stored shape of a verdict — what `toDto` in the route reads. */
export type VerdictRow = {
  category: string; narrative: string; pEffect: number; effect: number;
  ciLow: number; ciHigh: number; nA: number; nB: number; model: string;
};

export type ConcludeResult =
  | { ok: true; row: VerdictRow; fresh?: Verdict }
  | { ok: false; status: 409 | 500 | 502; error: string };

/**
 * Freeze a finished trial's verdict: compute the belief, classify it, have the
 * Analyst narrate it, and persist the snapshot, the hunch's `concluded` status
 * and its causal edge in one transaction.
 *
 * Called by the verdict route on a first view, and by the nightly sweep ahead
 * of one. `today` is the user's own calendar date (`localToday`). Nothing is
 * persisted on failure, so either caller can simply try again.
 */
export async function concludeTrial(
  hunch: VerdictHunch,
  userId: string,
  today: Date,
): Promise<ConcludeResult> {
  if (!hunch.hypothesis) return { ok: false, status: 409, error: "This trial hasn't started." };
  const design = hunch.protocol
    ? parseStoredDesign(hunch.protocol.design, hunch.hypothesis.outcomeMetric)
    : null;
  if (!hunch.protocol?.startedAt || !design) {
    return { ok: false, status: 409, error: "This trial hasn't started." };
  }
  // A diary has one arm. The engine compares two, and inventing a contrast the
  // data does not contain would be fabricating a result.
  if (hunch.protocol.safetyState === "observe-only") {
    return {
      ok: false,
      status: 409,
      error: "This one is a log, not a trial — there's nothing to compare it against.",
    };
  }

  const primary = pickPrimary(hunch.parameters);
  const exposureParam = pickExposure(hunch.parameters);
  const outcomeType = engineOutcomeType(primary?.type ?? hunch.hypothesis.outcomeType);
  const belief = computeBelief(
    armRows(hunch.checkIns, primary?.id, { shape: design.shape, exposureId: exposureParam?.id ?? null }),
    outcomeType,
  );
  const schedule = currentPhase(hunch.protocol.startedAt, design, today);

  const category = classifyVerdict(belief, schedule);
  if (category === null) {
    return { ok: false, status: 409, error: "This trial is still running." };
  }

  let verdict;
  try {
    verdict = await runAnalysis({
      category,
      belief,
      statement: hunch.hypothesis.statement,
      outcomeMetric: hunch.hypothesis.outcomeMetric,
      observational: design.shape === "observational",
      exposureLabel: exposureParam?.label ?? null,
    });
  } catch {
    // The Analyst call (or its structured-output parse) failed. Nothing is
    // persisted, so the next attempt retries cleanly.
    return { ok: false, status: 502, error: "Could not generate your verdict. Please try again." };
  }

  const edgeInput = writeEdgeData({
    category: verdict.category,
    effect: verdict.effect,
    pEffect: verdict.pEffect,
    statement: hunch.hypothesis.statement,
    outcomeMetric: hunch.hypothesis.outcomeMetric,
    hunchId: hunch.id,
    userId,
    subject: hunch.hypothesis.subject,
    shape: design.shape,
  });

  const row: VerdictRow = {
    category: verdict.category,
    narrative: verdict.narrative,
    pEffect: verdict.pEffect,
    effect: verdict.effect,
    ciLow: verdict.ci[0],
    ciHigh: verdict.ci[1],
    nA: verdict.nA,
    nB: verdict.nB,
    model: verdict.model,
  };

  try {
    await db.$transaction([
      db.verdict.create({ data: { hunchId: hunch.id, ...row } }),
      db.hunch.update({ where: { id: hunch.id }, data: { status: "concluded" } }),
      ...(edgeInput ? [db.causalEdge.create({ data: edgeInput })] : []),
    ]);
  } catch {
    // A concurrent first-read won the race and already wrote the verdict (the
    // @@unique on hunchId rejects the second insert). Serve the stored one so
    // both callers see the same frozen verdict instead of an error.
    const existing = await db.verdict.findUnique({ where: { hunchId: hunch.id } });
    if (existing) return { ok: true, row: existing };
    return { ok: false, status: 500, error: "Could not save your verdict. Please try again." };
  }

  // The route's fresh-path response is the Analyst's own output (it lacks
  // `outcome`, unlike `toDto(row, …)`) — carried through so the route's body
  // doesn't change shape now that the row comes back through `ConcludeResult`.
  return { ok: true, row, fresh: verdict };
}
