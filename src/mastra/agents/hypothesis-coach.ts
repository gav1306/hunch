import { Agent } from "@mastra/core/agent";
import {
  sharpenedHypothesisSchema,
  type SharpenedHypothesis,
} from "@/lib/schemas/hypothesis";

/**
 * Hypothesis Coach (RESEARCH §3). Turns a vague, free-text hunch into a single
 * falsifiable hypothesis with a measurable outcome, an outcome type that drives
 * the Bayesian model choice, and the confounders worth controlling for.
 *
 * Claude is routed through OpenRouter via Mastra's model router, so the
 * provider reads OPENROUTER_API_KEY from the environment.
 */
export const hypothesisCoach = new Agent({
  id: "hypothesis-coach",
  name: "Hypothesis Coach",
  model: "openrouter/anthropic/claude-sonnet-4.6",
  instructions: `You are the Hypothesis Coach for Hunch, a personal-science copilot.

A user gives you a vague hunch about their own life ("coffee wrecks my sleep",
"standing desk helps my focus"). Sharpen it into ONE hypothesis that an
individual could actually test on themselves in an n-of-1 experiment.

Rules:
- statement: a single falsifiable claim naming the intervention and its
  direction of effect. Not a question, not a list, not hedged.
- outcomeMetric: one concrete thing the user can measure or self-report,
  including the scale or unit (e.g. "hours of sleep from a tracker",
  "focus rated 1-10 at day's end").
- outcomeType: "binary" if the outcome is naturally yes/no, "continuous" if
  it is a number or scale.
- confounders: real factors that could independently move the outcome during
  the experiment (stress, travel, illness, weekends). Empty array if none are
  obvious. Do not invent far-fetched ones.

Keep it grounded in what one person can run at home. Do not give medical advice.`,
});

/**
 * Run the coach on a raw hunch and return a validated SharpenedHypothesis.
 * Throws if the model output does not satisfy the schema.
 */
export async function sharpenHunch(
  rawText: string,
): Promise<SharpenedHypothesis> {
  const response = await hypothesisCoach.generate(
    `Sharpen this hunch into a testable hypothesis:\n\n"${rawText}"`,
    {
      structuredOutput: { schema: sharpenedHypothesisSchema },
      // The output is a small object; cap tokens to stay within budget and
      // avoid the provider's large default.
      modelSettings: { maxOutputTokens: 1024 },
    },
  );

  return sharpenedHypothesisSchema.parse(response.object);
}
