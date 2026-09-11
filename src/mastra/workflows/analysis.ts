import { verdictSchema, type Verdict, type VerdictCategory } from "@/lib/schemas/verdict";
import type { Belief } from "@/lib/schemas/belief";
import { narrateVerdict } from "@/mastra/agents/analyst";

/**
 * The analysis step: narrate the decided category, then freeze the engine's
 * numbers into a Verdict DTO. Pure orchestration + assembly; persistence and the
 * status flip live in the API route (mirrors design.ts).
 */
export async function runAnalysis(input: {
  category: VerdictCategory;
  belief: Belief;
  statement: string;
  outcomeMetric: string;
  /**
   * Whether the arms came from the daily yes/no rather than the schedule.
   * Required so a new caller can't silently narrate an observational trial as
   * an intervention.
   */
  observational: boolean;
  /** The daily yes/no as the user labelled it; null when the hunch has none. */
  exposureLabel: string | null;
}): Promise<Verdict> {
  const narrative = await narrateVerdict({
    category: input.category,
    pEffect: input.belief.pEffect,
    effect: input.belief.effect,
    ci: input.belief.ci,
    statement: input.statement,
    outcomeMetric: input.outcomeMetric,
    observational: input.observational,
    exposureLabel: input.exposureLabel,
  });

  return verdictSchema.parse({
    category: input.category,
    narrative,
    pEffect: input.belief.pEffect,
    effect: input.belief.effect,
    ci: input.belief.ci,
    nA: input.belief.nA,
    nB: input.belief.nB,
    model: input.belief.model,
  });
}
