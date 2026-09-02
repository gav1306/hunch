import { z } from "zod";

/**
 * A factor that could independently move the outcome during the experiment,
 * plus the deterministic control we bake into the protocol (surface-and-warn).
 * Stored structured on Protocol so Phase 4 can statistically adjust later.
 */
export const confounderSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["behavioral", "physiological", "environmental"]),
  expectedDirection: z.enum(["increases", "decreases", "unknown"]),
  /** Plain-language instruction that holds this confounder constant. */
  control: z.string().trim().min(1),
});
export type Confounder = z.infer<typeof confounderSchema>;

/** One phase of an n-of-1 design. ABA = baseline, intervention, baseline. */
export const protocolPhaseSchema = z.object({
  label: z.enum(["A", "B"]),
  kind: z.enum(["baseline", "intervention"]),
  days: z.number().int().positive(),
  /** Human name for the phase, e.g. "Normal coffee" / "No coffee after 2pm". */
  name: z.string().trim().min(1),
  /** What the user actually does this phase, in their own terms. */
  action: z.string().trim().min(1),
});
export type ProtocolPhase = z.infer<typeof protocolPhaseSchema>;

/**
 * The experiment design. v1 emits ABA (three phases); the shape is left
 * general so randomized blocks can land later without a change.
 *
 * The floor is one phase, not two, because an observe-only hunch is a diary:
 * one baseline arm, nothing to contrast it with. Two-or-more used to stand in
 * for "this is a real experiment", and `phases.length === 1` is now what marks
 * a design that produces no verdict.
 */
export const protocolDesignSchema = z.object({
  phases: z.array(protocolPhaseSchema).min(1),
  washoutDays: z.number().int().min(0),
  controls: z.array(z.string().trim().min(1)),
  instructions: z.string().trim().min(1),
});
export type ProtocolDesign = z.infer<typeof protocolDesignSchema>;

/**
 * Parse a design read from storage, tolerating rows written before `name`/
 * `action` existed on the phase schema. Backfills sensible defaults so older
 * protocols still render — the scheduler only needs label/kind/days, and the
 * names are cosmetic. New designs from the agent already carry both fields.
 */
export function parseStoredDesign(
  raw: unknown,
  outcomeMetric = "your outcome",
): ProtocolDesign {
  const obj = (raw ?? {}) as { phases?: unknown };
  const phases = Array.isArray(obj.phases)
    ? obj.phases.map((p) => {
        const ph = (p ?? {}) as Partial<ProtocolPhase>;
        const baseline = ph.kind === "baseline";
        return {
          ...ph,
          name: ph.name?.trim() || (baseline ? "Baseline" : "Intervention"),
          action:
            ph.action?.trim() ||
            (baseline
              ? `Keep your normal routine. Log your ${outcomeMetric} each day.`
              : `Apply the change you're testing. Log your ${outcomeMetric} each day.`),
        };
      })
    : obj.phases;
  return protocolDesignSchema.parse({ ...(obj as object), phases });
}

/** Output of the deterministic power-analysis tool. */
export const powerInfoSchema = z.object({
  minDaysPerPhase: z.number().int().positive(),
  effectSize: z.enum(["small", "medium", "large"]),
  rationale: z.string().trim().min(1),
});
export type PowerInfo = z.infer<typeof powerInfoSchema>;

/** The Safety Reviewer's verdict. The gate. */
export const safetyVerdictSchema = z.object({
  state: z.enum(["approved", "refused"]),
  reason: z.string().trim().min(1),
  routedToDoctor: z.boolean(),
});
export type SafetyVerdict = z.infer<typeof safetyVerdictSchema>;

/** The composed output of the design workflow. */
export const designResultSchema = z.object({
  confounders: z.array(confounderSchema),
  design: protocolDesignSchema,
  powerInfo: powerInfoSchema,
  safety: safetyVerdictSchema,
});
export type DesignResult = z.infer<typeof designResultSchema>;

/**
 * How long a diary runs.
 *
 * A diary has no natural end, but every screen here assumes one: the adherence
 * strip draws a fixed row, home sorts by days remaining, and "done" is what
 * stops a hunch competing for attention. Two weeks is enough habit to hold and
 * enough rows to see a shape in. Ending is not deleting — the log stays, and
 * running it again is one tap.
 */
export const OBSERVE_DAYS = 14;

/**
 * The protocol for a hunch the app will record but will not schedule.
 *
 * One phase, labelled `A`/`baseline` deliberately: `currentPhase`, the
 * adherence strip, the check-in's phase text and `CheckIn.phase` all already
 * understand A and B, and a third label would mean teaching each of them a case
 * the user never sees. What marks a diary is `phases.length === 1`, and that is
 * what the code checks.
 */
export function observeOnlyDesign(outcomeMetric: string): ProtocolDesign {
  return {
    phases: [
      {
        label: "A",
        kind: "baseline",
        days: OBSERVE_DAYS,
        name: "Just keep the record",
        action: `Change nothing about your routine. Each day, log ${outcomeMetric}.`,
      },
    ],
    washoutDays: 0,
    controls: [],
    instructions:
      "This one is a log, not a trial: nothing changes, you just write down what " +
      "happens. At the end you'll have your own record of it, and it's yours to export.",
  };
}

/**
 * May this protocol be started and logged against? A diary may — nothing about
 * it needs approving, because it schedules no change at all. Pending and refused
 * may not.
 */
export function canRun(safetyState: string): boolean {
  return safetyState === "approved" || safetyState === "observe-only";
}
