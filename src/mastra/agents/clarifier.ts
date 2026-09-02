import { Agent } from "@mastra/core/agent";
import { claudeModel } from "@/mastra/model";
import {
  clarifyingQuestionsSchema,
  type ClarifyingQuestions,
} from "@/lib/schemas/clarify";
import type { Prior } from "@/lib/schemas/prior";

/**
 * The Clarifier (pre-coach). Reads a vague hunch and asks at most three tappable
 * questions that materially sharpen it — the outcome, how it's measured, and the
 * exact intervention/dose. The answers feed the Hypothesis Coach so it commits an
 * accurate hypothesis instead of guessing.
 *
 * Runs on the shared Claude Sonnet 5 model. See src/mastra/model.ts.
 */
export const clarifier = new Agent({
  id: "clarifier",
  name: "Clarifier",
  model: claudeModel,
  instructions: `You are the Clarifier for Hunch, a personal-science copilot.

A user drops a vague hunch about their life ("coffee wrecks my sleep"). Before
it can become a testable hypothesis, you ask the FEW questions that most sharpen
it. Do not restate the hunch. Do not give advice.

Rules:
- Ask AT MOST 3 questions. Fewer is better. Only ask what genuinely changes the
  hypothesis.
- ALWAYS ask how they would measure the outcome, and phrase the options as the
  ways an ordinary person actually could. If the honest measure needs a device —
  a blood-pressure cuff, a glucose monitor, a hygrometer, a kitchen scale — then
  one option must be "I have one and can read it daily", and another must be
  something they can perceive WITHOUT it: "how my energy feels after lunch",
  "whether the air feels damp", "whether my head aches". This is the question
  that decides whether the trial survives its first week, so never skip it.
- If the hunch is about several of something ("my houseplants", "my kids", "my
  cars"), ask WHICH ONE. An experiment measures one subject; averaging several
  is not a measurement of any of them.
- Otherwise ask about the outcome itself and the exact intervention (dose,
  timing, "entirely vs partly").
- Each question offers 2-4 concrete, tappable options phrased in the user's own
  world (for sleep: "trouble falling asleep", "waking at night", "groggy
  mornings"). Options must be distinct and realistic.
- Set allowOther true when a sensible answer might fall outside your options.
- id: a short stable slug for the question ("outcome", "measure", "which", "dose").
- Never ask about medical history, a diagnosis, or anything a doctor should
  handle. You are working out what can be logged, not what is wrong with them.`,
});

/**
 * Ask the clarifying questions for a raw hunch. Priors (past findings) are
 * passed so the questions don't re-litigate what the user already knows.
 */
export async function askClarifying(
  rawText: string,
  priors: Prior[] = [],
): Promise<ClarifyingQuestions> {
  const priorsBlock =
    priors.length > 0
      ? `\n\nThe user already learned these related findings; don't ask about them again:\n${priors
          .map((p) => `- ${p.cause} (${p.direction}, ${Math.round(p.confidence * 100)}% confident)`)
          .join("\n")}`
      : "";

  const response = await clarifier.generate(
    `Ask the clarifying questions for this hunch:\n\n"${rawText}"${priorsBlock}`,
    {
      structuredOutput: { schema: clarifyingQuestionsSchema },
      modelSettings: { maxOutputTokens: 1024 },
    },
  );

  return clarifyingQuestionsSchema.parse(response.object);
}
