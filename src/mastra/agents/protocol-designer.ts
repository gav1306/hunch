import { Agent } from "@mastra/core/agent";
import { claudeModel } from "@/mastra/model";
import {
  observationalDesign,
  protocolDesignSchema,
  type Confounder,
  type PowerInfo,
  type ProtocolDesign,
  type ProtocolPhase,
  type ProtocolShape,
} from "@/lib/schemas/protocol";

/**
 * Protocol Designer (RESEARCH §3 / Phase 3). Turns a sharpened hypothesis into
 * a concrete n-of-1 design. Usually that is ABA — baseline (A) -> intervention
 * (B) -> baseline (A) — with phase lengths informed by the deterministic power
 * tool and the confounder controls folded into the instructions. The agent does
 * NOT do math: phase lengths come from `power.minDaysPerPhase`.
 *
 * When the change cannot be applied on demand the design is instead a single
 * observation window, and there the agent writes only the prose — see
 * `designProtocolShape`, which tells it so in the prompt and builds the
 * structure itself.
 */
export const protocolDesigner = new Agent({
  id: "protocol-designer",
  name: "Protocol Designer",
  model: claudeModel,
  instructions: `You are the Protocol Designer for Hunch, a personal-science copilot.

Given a sharpened hypothesis, design an n-of-1 experiment the user can run on
themselves. Usually that is ABA: phase A (baseline, normal behaviour), phase B
(intervention), then phase A again (return to baseline), which isolates the
intervention's effect. When the change cannot be applied on demand, each request
says so and asks for a single observation window instead — follow what the
request asks for.

Rules for an ABA design:
- phases: exactly three — A (baseline), B (intervention), A (baseline). Use the
  provided minimum days per phase for EACH phase's "days". Do not invent your own
  length and do not do arithmetic; use the number you are given.
- Each phase also needs a short human "name" and an "action". name: what the
  user calls this phase in plain words ("Normal coffee", "No coffee after 2pm").
  action: exactly what they do that phase and what to log, in their own terms.
  Baseline phases keep normal behaviour; the B phase names the specific change.
- washoutDays: a short gap (1-3 days) between phases so the prior phase stops
  influencing the next. Use 0 only if a washout makes no sense.
- instructions: clear, friendly, step-by-step guidance for running all three
  phases and logging the outcome metric. Reference the controls.

Whatever the shape: include every confounder control you are given in
"controls", verbatim, and always return non-empty "instructions".

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

/**
 * Design the protocol for one hypothesis.
 *
 * Two shapes. "phased" is the ABA trial the model designs. "observational" is
 * a single 21-day window whose arms come from the daily exposure answer rather
 * than the calendar — and there, the structure is taken out of the model's
 * hands rather than negotiated with it: `phases`, `washoutDays` and `shape`
 * are `observationalDesign`'s, and only the prose (`controls`, `instructions`)
 * is the model's. A model that returns three phases anyway has them discarded.
 */
export async function designProtocolShape(input: {
  statement: string;
  outcomeMetric: string;
  outcomeType: "binary" | "continuous";
  confounders: Confounder[];
  power: PowerInfo;
  /** Defaults to the scheduled ABA shape. */
  shape?: ProtocolShape;
  /** The daily yes/no, for an observational window. */
  exposureLabel?: string;
}): Promise<ProtocolDesign> {
  const controls = input.confounders.map((c) => c.control);
  const controlLine = controls.length ? controls.join(" | ") : "none";
  const observational = input.shape === "observational";
  const exposureLabel = input.exposureLabel ?? "the change";

  // Two prompts, not one with holes in it: the ABA rules ("phases: exactly
  // three", the deterministic phase length) are wrong for a window, and the
  // observational branch has to countermand them explicitly.
  const prompt = observational
    ? `Design a single observation window for this hypothesis.

Hypothesis: ${input.statement}
Outcome metric: ${input.outcomeMetric}
Outcome type: ${input.outcomeType}
The daily yes/no they will answer: "${exposureLabel}"
Confounder controls to include verbatim: ${controlLine}

This person CANNOT schedule the change — it depends on an opportunity that does
not arrive on request. There are no phases to design and no washout: they live
normally for the whole window and log, each day, whether "${exposureLabel}"
happened. Do NOT invent phases, do NOT propose an ABA structure, and do NOT ask
them to do the thing on particular days. Return "controls" (the confounder
controls you are given, verbatim) and "instructions" for living normally and
logging both questions daily. Anything you return under "phases" is discarded.

Return ALL fields, especially "instructions" — it is required and must be non-empty.`
    : `Design an ABA n-of-1 protocol for this hypothesis.

Hypothesis: ${input.statement}
Outcome metric: ${input.outcomeMetric}
Outcome type: ${input.outcomeType}
Minimum days per phase (use this exact number for each phase): ${input.power.minDaysPerPhase}
Confounder controls to include verbatim: ${controlLine}

Name each phase in the user's own words (e.g. "Normal coffee" vs "No coffee after 2pm") and give a concrete action for each.
Return ALL fields, especially "instructions" — it is required and must be non-empty.`;

  const response = await protocolDesigner.generate(prompt, {
    structuredOutput: { schema: protocolDesignSchema },
    modelSettings: { maxOutputTokens: 2048 },
  });

  const raw = (response.object ?? {}) as Partial<ProtocolDesign>;

  if (observational) {
    const base = observationalDesign(input.outcomeMetric, exposureLabel);
    return protocolDesignSchema.parse({
      ...base,
      controls: raw.controls?.length ? raw.controls : controls,
      instructions:
        typeof raw.instructions === "string" && raw.instructions.trim().length > 0
          ? raw.instructions
          : base.instructions,
    });
  }

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
