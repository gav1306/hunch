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
  hypothesis: what outcome moves, how they'd measure it, and the exact
  intervention (dose, timing, "entirely vs partly").
- Each question offers 2-4 concrete, tappable options phrased in the user's own
  world (for sleep: "trouble falling asleep", "waking at night", "groggy
  mornings"). Options must be distinct and realistic.
- Set allowOther true when a sensible answer might fall outside your options.
- id: a short stable slug for the question ("outcome", "measure", "dose").
- Never ask about medical history or anything a doctor should handle.`,
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
