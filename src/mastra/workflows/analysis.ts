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
}): Promise<Verdict> {
  const narrative = await narrateVerdict({
    category: input.category,
    pEffect: input.belief.pEffect,
    effect: input.belief.effect,
    ci: input.belief.ci,
    statement: input.statement,
    outcomeMetric: input.outcomeMetric,
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
