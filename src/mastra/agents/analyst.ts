import { Agent } from "@mastra/core/agent";
import { claudeModel } from "@/mastra/model";
import {
  verdictNarrativeSchema,
  type VerdictCategory,
} from "@/lib/schemas/verdict";

/**
 * Analyst (RESEARCH §3 / Phase 5). Translates a concluded trial's already-decided
 * category and the engine's numbers into a short, honest verdict. It does NOT do
 * math and never invents or contradicts a probability (RULES §3) — the number is
 * handed to it. Inconclusive outcomes are framed as legitimate findings.
 */
export const analyst = new Agent({
  id: "analyst",
  name: "Analyst",
  model: claudeModel,
  instructions: `You are the Analyst for Hunch, a personal-science copilot.

A user just finished an n-of-1 self-experiment. You are given the verdict category
(already decided by the statistics — do not second-guess it), the effect size, the
probability the intervention helped, and the credible interval. Write a short,
plain-English verdict (2-4 sentences).

Rules:
- Never invent, recompute, or contradict a number. State the probability and effect
  you are given if you mention numbers; do not make up new ones.
- "helped" / "hurt": these category names mean the outcome went UP or DOWN. Say
  which way it moved and roughly how much, in the user's own terms, and note the
  confidence. Never call the change good, bad, better, worse, an improvement or a
  setback: a rising number is a win for hours of sleep and a loss for bugs or
  spending, and you are not told which this is. Keep it grounded — this is one
  person's result, not a universal truth.
- "inconclusive_no_effect": frame it as a real, useful finding — the data did not
  show a clear effect either way. Not a failure.
- "inconclusive_insufficient": explain there weren't enough logged days to judge, and
  that running longer would sharpen it. Encouraging, not scolding.
- No medical advice. No next-experiment prescriptions.`,
});

/** Ask the Analyst to narrate a decided category. Returns prose only. */
export async function narrateVerdict(input: {
  category: VerdictCategory;
  pEffect: number;
  effect: number;
  ci: [number, number];
  statement: string;
  outcomeMetric: string;
}): Promise<string> {
  const prompt = `Write the verdict for this concluded experiment.

Hypothesis: ${input.statement}
Outcome metric: ${input.outcomeMetric}
Verdict category (decided, do not change): ${input.category}
Probability the outcome went up (P(effect > 0)): ${input.pEffect.toFixed(2)}
Effect size (intervention minus baseline): ${input.effect.toFixed(2)}
95% credible interval on the effect: [${input.ci[0].toFixed(2)}, ${input.ci[1].toFixed(2)}]`;

  const response = await analyst.generate(prompt, {
    structuredOutput: { schema: verdictNarrativeSchema },
    modelSettings: { maxOutputTokens: 1024 },
  });

  return verdictNarrativeSchema.parse(response.object).narrative;
}
