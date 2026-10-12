import type { PhaseStatus } from "@/lib/schedule";
import type { ProtocolDesign } from "@/lib/schemas/protocol";

export type PlanSummary = {
  /** The running phase's own name, e.g. "Walk after dinner". */
  phase: string;
  kind: "baseline" | "intervention";
  /** Days left in the phase after today; 0 on its last day. */
  endsInDays: number;
  /** What the user holds steady throughout, from the design. */
  controls: string[];
};

/**
 * The plan at a glance, for the dashboard's side column: which phase is
 * running, how long it has left, and what stays the same. Null whenever there
 * is no running phase to describe: before the start, on a rest day between
 * phases, and once the trial is over.
 */
export function planSummary(
  schedule: PhaseStatus | null,
  design: ProtocolDesign,
): PlanSummary | null {
  if (!schedule?.started || schedule.done || schedule.washout) return null;
  if (schedule.phaseIndex === null) return null;
  const phase = design.phases[schedule.phaseIndex];
  if (!phase) return null;

  return {
    phase: phase.name,
    kind: phase.kind,
    endsInDays: Math.max(0, phase.days - schedule.dayInPhase - 1),
    controls: design.controls,
  };
}
