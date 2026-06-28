import { Agent } from "@mastra/core/agent";
import {
  protocolDesignSchema,
  type Confounder,
  type PowerInfo,
  type ProtocolDesign,
} from "@/lib/schemas/protocol";

/**
 * Protocol Designer (RESEARCH §3 / Phase 3). Turns a sharpened hypothesis into
 * a concrete ABA n-of-1 design: baseline (A) -> intervention (B) -> baseline (A),
 * with phase lengths informed by the deterministic power tool and the confounder
 * controls folded into the instructions. The agent does NOT do math — phase
 * lengths come from `power.minDaysPerPhase`.
 */
export const protocolDesigner = new Agent({
  id: "protocol-designer",
  name: "Protocol Designer",
  model: "openrouter/anthropic/claude-sonnet-4.6",
  instructions: `You are the Protocol Designer for Hunch, a personal-science copilot.

Given a sharpened hypothesis, design an ABA n-of-1 experiment the user can run on
themselves: phase A (baseline, normal behaviour), phase B (intervention), then
phase A again (return to baseline). This isolates the intervention's effect.

Rules:
- phases: exactly three — A (baseline), B (intervention), A (baseline). Use the
  provided minimum days per phase for EACH phase's "days". Do not invent your own
  length and do not do arithmetic; use the number you are given.
- washoutDays: a short gap (1-3 days) between phases so the prior phase stops
  influencing the next. Use 0 only if a washout makes no sense.
- controls: include every confounder control you are given, verbatim.
- instructions: clear, friendly, step-by-step guidance for running all three
  phases and logging the outcome metric. Reference the controls.

Keep it realistic for one person at home. Never recommend prescription meds,
fasting, or anything a doctor should oversee — that is handled separately.`,
});

export async function designProtocolShape(input: {
  statement: string;
  outcomeMetric: string;
  outcomeType: "binary" | "continuous";
  confounders: Confounder[];
  power: PowerInfo;
}): Promise<ProtocolDesign> {
  const controls = input.confounders.map((c) => c.control);
  const prompt = `Design an ABA n-of-1 protocol for this hypothesis.

Hypothesis: ${input.statement}
Outcome metric: ${input.outcomeMetric}
Outcome type: ${input.outcomeType}
Minimum days per phase (use this exact number for each phase): ${input.power.minDaysPerPhase}
Confounder controls to include verbatim: ${controls.length ? controls.join(" | ") : "none"}`;

  const response = await protocolDesigner.generate(prompt, {
    structuredOutput: { schema: protocolDesignSchema },
    modelSettings: { maxOutputTokens: 1024 },
  });

  return protocolDesignSchema.parse(response.object);
}
