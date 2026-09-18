import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { claudeModel } from "@/mastra/model";
import { llmUsage, timed } from "@/lib/timing";
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
 * a concrete n-of-1 design: ABA — baseline (A) -> intervention (B) -> baseline
 * (A) — with phase lengths from the deterministic power tool and the
 * confounder controls folded in.
 *
 * The model writes only what needs judgment: what the user calls each phase,
 * what they do in it, and how long a washout the change needs. Structure,
 * lengths, controls and the step-by-step instructions are built here. It used
 * to write all of it — ~900 tokens, ~10s — most of which was copied from its
 * input or, for `instructions`, read only by the safety reviewer.
 *
 * When the change cannot be applied on demand the design is a single
 * observation window and the model is not asked at all — see
 * `designProtocolShape`.
 */
export const protocolDesigner = new Agent({
  id: "protocol-designer",
  name: "Protocol Designer",
  model: claudeModel,
  instructions: `You are the Protocol Designer for Hunch, a personal-science copilot.

Given a sharpened hypothesis, you name the phases of an ABA n-of-1 experiment
the user runs on themselves: phase A (baseline, normal behaviour), phase B (the
change), then phase A again. The app sets the phase lengths and structure; you
write the words.

- baselineName / interventionName / returnName: what the user calls each phase
  in plain words ("Normal coffee", "No coffee after 2pm", "Back to normal
  coffee"). A few words each.
- baselineAction / interventionAction / returnAction: exactly what they do in
  that phase, in their own terms, in one or two short sentences. Baseline keeps
  normal behaviour; the intervention names the specific change; the return
  phase stops the change and, being the last, says what to record at the end.
- washoutDays: a short gap (1-3 days) between phases so the prior phase stops
  influencing the next. Use 0 only if a washout makes no sense.

Keep it realistic for one person at home. Never recommend prescription meds,
fasting, or anything a doctor should oversee — that is handled separately.`,
});

/**
 * The model's whole output for a phased design. Everything else in a
 * ProtocolDesign is decided in code.
 */
export const phaseCopySchema = z.object({
  baselineName: z.string(),
  baselineAction: z.string(),
  interventionName: z.string(),
  interventionAction: z.string(),
  /** The closing baseline: same behaviour as the first, but it ends the trial. */
  returnName: z.string(),
  returnAction: z.string(),
  washoutDays: z.number().int(),
});
export type PhaseCopy = z.infer<typeof phaseCopySchema>;

/** Most days a washout may take; a longer gap just stretches the trial. */
const MAX_WASHOUT_DAYS = 3;

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

/**
 * The step-by-step instructions for a design, built from its structure: every
 * phase's name and action, the washout, and each control. Always non-empty, so
 * the schema's `instructions` invariant holds.
 */
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
 * Two shapes. "phased" is the ABA trial: the model names the two kinds of
 * phase and picks a washout, and the rest is assembled here. "observational"
 * is a single 21-day window whose arms come from the daily exposure answer —
 * there is nothing in it for the model to decide, so it is built without one.
 *
 * `instructions` is composed from the phases and controls in both cases. No
 * screen shows it; the safety reviewer reads it, so it has to carry each
 * phase's action — the change being tested — verbatim.
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

  if (input.shape === "observational") {
    const base = observationalDesign(input.outcomeMetric, input.exposureLabel ?? "the change");
    return protocolDesignSchema.parse({ ...base, controls });
  }

  const prompt = `Name the phases of an ABA n-of-1 experiment for this hypothesis.

Hypothesis: ${input.statement}
Outcome metric: ${input.outcomeMetric}
Outcome type: ${input.outcomeType}

Name each phase in the user's own words (e.g. "Normal coffee" vs "No coffee after 2pm") and give a concrete action for each.`;

  const response = await timed(
    "designer",
    () =>
      protocolDesigner.generate(prompt, {
        structuredOutput: { schema: phaseCopySchema },
        modelSettings: { maxOutputTokens: 512 },
      }),
    llmUsage,
  );

  const raw = (response.object ?? {}) as Partial<PhaseCopy>;
  const days = input.power.minDaysPerPhase;
  const baseline = {
    label: "A" as const,
    kind: "baseline" as const,
    days,
    name: raw.baselineName,
    action: raw.baselineAction,
  };
  const intervention = {
    label: "B" as const,
    kind: "intervention" as const,
    days,
    name: raw.interventionName,
    action: raw.interventionAction,
  };
  // The closing baseline gets its own copy, since it's where the trial ends;
  // without one it reads the same as the first.
  const back = {
    ...baseline,
    name: raw.returnName?.trim() || baseline.name,
    action: raw.returnAction?.trim() || baseline.action,
  };
  const phases = fillPhaseDefaults([baseline, intervention, back], input.outcomeMetric);
  const washoutDays = Math.min(MAX_WASHOUT_DAYS, Math.max(0, Math.round(raw.washoutDays ?? 0)));

  return protocolDesignSchema.parse({
    phases,
    washoutDays,
    controls,
    instructions: composeInstructions({ phases, washoutDays, controls }, input.outcomeMetric),
    shape: "phased",
  });
}
