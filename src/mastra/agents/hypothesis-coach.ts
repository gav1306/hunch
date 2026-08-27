import { Agent } from "@mastra/core/agent";
import { claudeModel } from "@/mastra/model";
import {
  sharpenedHypothesisSchema,
  type SharpenedHypothesis,
} from "@/lib/schemas/hypothesis";
import type { Prior } from "@/lib/schemas/prior";
import type { ClarifyingAnswer } from "@/lib/schemas/clarify";

/**
 * Hypothesis Coach (RESEARCH §3). Turns a vague, free-text hunch into a single
 * falsifiable hypothesis with a measurable outcome, an outcome type that drives
 * the Bayesian model choice, and the confounders worth controlling for.
 *
 * Claude (Sonnet 5) runs on Amazon Bedrock via the shared `claudeModel`
 * instance; AWS credentials resolve from the standard provider chain. See
 * `src/mastra/model.ts`.
 */
export const hypothesisCoach = new Agent({
  id: "hypothesis-coach",
  name: "Hypothesis Coach",
  model: claudeModel,
  instructions: `You are the Hypothesis Coach for Hunch, a personal-science copilot.

A user gives you a vague hunch about their own life ("coffee wrecks my sleep",
"standing desk helps my focus"). Sharpen it into ONE hypothesis that an
individual could actually test on themselves in an n-of-1 experiment.

Rules:
- statement: ONE plain-English claim, phrased the way the user would say it to
  a friend. Keep it short (about 8-14 words) and first person. Name the change
  and which way it pushes the outcome (more/less, better/worse). Everyday words
  only — NO jargon, NO parentheses, NO clinical qualifiers, NO "compared to..."
  clauses, and NO numbers or units (those live in outcomeMetric). It must still
  be a single falsifiable claim — not a question, not a list, not hedged.
  Examples:
    "coffee wrecks my sleep" -> "Coffee after lunch makes me sleep worse."
    "standing desk helps focus" -> "Using a standing desk sharpens my focus."
- outcomeMetric: one concrete thing the user can measure or self-report,
  including the scale or unit (e.g. "hours of sleep from a tracker",
  "focus rated 1-10 at day's end").
- outcomeType: "binary" if the outcome is naturally yes/no, "continuous" if
  it is a number or scale.
- confounders: real factors that could independently move the outcome during
  the experiment (stress, travel, illness, weekends). Empty array if none are
  obvious. Do not invent far-fetched ones.
- trackers: 0-4 OTHER things the person could log daily that help interpret the
  result — the symptoms or co-variables around the outcome (e.g. caffeine after
  2pm, stress, exercise, screen time). Each is { label, type, unit?, min?, max? }.
  Use "binary" for yes/no logs and "continuous" for numbers or scales; for a
  rating scale set unit (e.g. "1-10") plus min and max. Never repeat the
  outcomeMetric as a tracker. Propose none rather than padding with filler.

Keep it grounded in what one person can run at home. Do not give medical advice.`,
});

/**
 * Run the coach on a raw hunch and return a validated SharpenedHypothesis. When
 * the user has related past findings (Phase 6 recall), they are passed as
 * context so the coach can account for what is already known — it still outputs
 * only the sharpened hypothesis.
 */
/**
 * Build the coach prompt from the raw hunch, any recalled priors, and the
 * user's clarifying answers. Extracted + exported so it is unit-testable
 * without a live model call.
 */
export function buildSharpenPrompt(
  rawText: string,
  priors: Prior[],
  answers: ClarifyingAnswer[],
): string {
  const priorsBlock =
    priors.length > 0
      ? `\n\nThe user has already learned these related findings; take them into account, do not contradict them:\n${priors
          .map((p) => `- ${p.cause} (${p.direction}, ${Math.round(p.confidence * 100)}% confident)`)
          .join("\n")}`
      : "";

  const answersBlock =
    answers.length > 0
      ? `\n\nThe user answered these clarifying questions — treat them as ground truth:\n${answers
          .map((a) => `- ${a.prompt} -> ${a.answer}`)
          .join("\n")}`
      : "";

  return `Sharpen this hunch into a testable hypothesis:\n\n"${rawText}"${answersBlock}${priorsBlock}`;
}

export async function sharpenHunch(
  rawText: string,
  priors: Prior[] = [],
  answers: ClarifyingAnswer[] = [],
): Promise<SharpenedHypothesis> {
  const response = await hypothesisCoach.generate(
    buildSharpenPrompt(rawText, priors, answers),
    {
      structuredOutput: { schema: sharpenedHypothesisSchema },
      // The output is a small object; cap tokens to stay within budget and
      // avoid the provider's large default.
      modelSettings: { maxOutputTokens: 1024 },
    },
  );

  return sharpenedHypothesisSchema.parse(response.object);
}
