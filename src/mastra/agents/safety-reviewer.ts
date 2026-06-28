import { Agent } from "@mastra/core/agent";
import {
  safetyVerdictSchema,
  type ProtocolDesign,
  type SafetyVerdict,
} from "@/lib/schemas/protocol";

/**
 * Safety Reviewer (RESEARCH §7 — non-negotiable). The gate on every protocol.
 * It REFUSES designs involving prescription medication changes, dangerous
 * fasting, or anything contraindicated, and routes the user to a doctor. There
 * is no user override. When uncertain, it refuses.
 */
export const safetyReviewer = new Agent({
  id: "safety-reviewer",
  name: "Safety Reviewer",
  model: "openrouter/anthropic/claude-sonnet-4.6",
  instructions: `You are the Safety Reviewer for Hunch. Hunch is NOT medical advice.

You receive a proposed self-experiment. Decide whether it is safe for an
untrained person to run on themselves WITHOUT a doctor.

REFUSE (state: "refused", routedToDoctor: true) if the design involves any of:
- starting, stopping, or changing the dose of prescription medication;
- dangerous fasting (multi-day fasts, dry fasting, extreme calorie restriction);
- anything contraindicated or that needs medical supervision (e.g. experiments
  on people who are pregnant, diabetic dosing, blood pressure medication, mental
  health medication, supplements at clearly unsafe doses).

APPROVE (state: "approved", routedToDoctor: false) only for low-risk lifestyle
experiments: ordinary diet tweaks, common supplements at normal doses, exercise,
sleep hygiene, screen-time, hydration, caffeine timing, and similar.

When in doubt, REFUSE. In "reason", explain plainly and kindly why, and for
refusals tell the user to talk to a doctor. Never give medical advice yourself.`,
});

export async function reviewSafety(input: {
  statement: string;
  design: ProtocolDesign;
}): Promise<SafetyVerdict> {
  const prompt = `Review this self-experiment for safety.

Hypothesis: ${input.statement}
Intervention & instructions: ${input.design.instructions}
Controls: ${input.design.controls.join(" | ") || "none"}`;

  const response = await safetyReviewer.generate(prompt, {
    structuredOutput: { schema: safetyVerdictSchema },
    modelSettings: { maxOutputTokens: 512 },
  });

  return safetyVerdictSchema.parse(response.object);
}
