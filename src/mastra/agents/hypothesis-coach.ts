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
 * Claude (Sonnet 5) runs via the shared `claudeModel` instance. See
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
  "focus rated 1-5 at day's end").
- outcomeType: "binary" if the outcome is naturally yes/no, "continuous" if
  it is a number or scale.
- expectedDirection: "up" if your own statement says the change RAISES the
  outcome metric, "down" if it lowers it. For "Skipping my walk makes my code
  buggier" with outcome "bugs found", that is "up". This is only which way the
  number moves. Never whether that is good or bad — you cannot know that.
- confounders: real factors that could independently move the outcome during
  the experiment (stress, travel, illness, weekends). Empty array if none are
  obvious. Do not invent far-fetched ones.
- trackers: 0-4 OTHER things the person could log daily that help interpret the
  result — the symptoms or co-variables around the outcome (e.g. caffeine after
  2pm, stress, exercise, screen time). Each is { label, type, unit?, min?, max? }.
  Never repeat the outcomeMetric as a tracker.

  Choose "type" from exactly these four:
    "binary" — a yes/no tap. "Took my walk", "Ate before shopping".
    "scale"  — a subjective rating. ALWAYS 1-5: set unit "1-5", min 1, max 5.
               Never propose 1-10; five is what a person can honestly tell apart.
    "count"  — how many times something happened. "Coffees", "Bugs found",
               "Times I woke up". Whole numbers. No unit needed.
    "amount" — a measured quantity with a unit. "Sleep" in hours, "Spend" in
               dollars, "Weight" in kg.

  Before you propose an "amount", answer this to yourself: how would an
  ordinary person get this number, every day, without buying anything? A phone
  gives sleep, steps and screen time. A receipt gives money. A kitchen scale
  gives weight. A HYGROMETER, a BLOOD-PRESSURE CUFF and a GLUCOSE MONITOR do
  not — almost nobody has one.

  When the honest measurement needs a device, propose what the person can
  actually perceive instead, as a "scale" or a "binary":
    blood glucose      -> "Energy after lunch", scale 1-5
    room humidity      -> "Air feels damp", binary
    blood pressure     -> "Headache or tightness today", binary
  A weaker measure logged every day beats a precise one never taken.

  Propose FEWER than four unless each one genuinely helps read the result.
  Three padded trackers are worse than one good one, and "time spent doing the
  thing" is usually padding.

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
