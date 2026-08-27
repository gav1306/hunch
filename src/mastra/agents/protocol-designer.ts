import { Agent } from "@mastra/core/agent";
import { claudeModel } from "@/mastra/model";
import {
  protocolDesignSchema,
  type Confounder,
  type PowerInfo,
  type ProtocolDesign,
  type ProtocolPhase,
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
  model: claudeModel,
  instructions: `You are the Protocol Designer for Hunch, a personal-science copilot.

Given a sharpened hypothesis, design an ABA n-of-1 experiment the user can run on
themselves: phase A (baseline, normal behaviour), phase B (intervention), then
phase A again (return to baseline). This isolates the intervention's effect.

Rules:
- phases: exactly three — A (baseline), B (intervention), A (baseline). Use the
  provided minimum days per phase for EACH phase's "days". Do not invent your own
  length and do not do arithmetic; use the number you are given.
- Each phase also needs a short human "name" and an "action". name: what the
  user calls this phase in plain words ("Normal coffee", "No coffee after 2pm").
  action: exactly what they do that phase and what to log, in their own terms.
  Baseline phases keep normal behaviour; the B phase names the specific change.
- washoutDays: a short gap (1-3 days) between phases so the prior phase stops
  influencing the next. Use 0 only if a washout makes no sense.
- controls: include every confounder control you are given, verbatim.
- instructions: clear, friendly, step-by-step guidance for running all three
  phases and logging the outcome metric. Reference the controls.

Keep it realistic for one person at home. Never recommend prescription meds,
fasting, or anything a doctor should oversee — that is handled separately.`,
});

/**
 * Deterministic fallback instructions, built from the structured design when the
 * model omits or empties the `instructions` field. Guarantees the schema's
 * non-empty `instructions` invariant holds without a hard failure blanking the
 * page — prose is nicer, but a valid protocol always wins over a 500.
 */
/**
 * Fill any missing per-phase name/action deterministically so the schema's
 * non-empty invariant holds even when the model omits them. Baseline phases
 * describe normal behaviour; intervention phases name the change.
 */
export function fillPhaseDefaults(
  phases: Array<Partial<ProtocolPhase> & Pick<ProtocolPhase, "label" | "kind" | "days">>,
  outcomeMetric: string,
): ProtocolPhase[] {
  return phases.map((p) => {
    const baseline = p.kind === "baseline";
    return {
      label: p.label,
      kind: p.kind,
      days: p.days,
      name: p.name?.trim() || (baseline ? "Baseline" : "Intervention"),
      action:
        p.action?.trim() ||
        (baseline
          ? `Keep your normal routine. Log your ${outcomeMetric} each day.`
          : `Apply the change you're testing. Log your ${outcomeMetric} each day.`),
    };
  });
}

export function composeInstructions(
  design: Pick<ProtocolDesign, "phases" | "washoutDays" | "controls">,
  outcomeMetric: string,
): string {
  const lines = design.phases.map((p, i) => {
    return `Phase ${i + 1} — ${p.name} (${p.days} days): ${p.action}`;
  });
  lines.push(`Log your ${outcomeMetric} each day of every phase.`);
  if (design.washoutDays > 0) {
    lines.push(
      `Leave a ${design.washoutDays}-day washout gap between phases so the previous phase stops affecting the next.`,
    );
  }
  if (design.controls.length) {
    lines.push("Keep these constant throughout:");
    lines.push(...design.controls.map((c) => `- ${c}`));
  }
  return lines.join("\n");
}

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
Confounder controls to include verbatim: ${controls.length ? controls.join(" | ") : "none"}

Name each phase in the user's own words (e.g. "Normal coffee" vs "No coffee after 2pm") and give a concrete action for each.
Return ALL fields, especially "instructions" — it is required and must be non-empty.`;

  const response = await protocolDesigner.generate(prompt, {
    structuredOutput: { schema: protocolDesignSchema },
    modelSettings: { maxOutputTokens: 2048 },
  });

  const raw = (response.object ?? {}) as Partial<ProtocolDesign>;
  const rawPhases = (raw.phases ?? []) as Array<
    Partial<ProtocolPhase> & Pick<ProtocolPhase, "label" | "kind" | "days">
  >;
  const phases = fillPhaseDefaults(rawPhases, input.outcomeMetric);

  const instructions =
    typeof raw.instructions === "string" && raw.instructions.trim().length > 0
      ? raw.instructions
      : composeInstructions(
          { phases, washoutDays: raw.washoutDays ?? 0, controls: raw.controls ?? controls },
          input.outcomeMetric,
        );

  return protocolDesignSchema.parse({ ...raw, phases, instructions });
}
