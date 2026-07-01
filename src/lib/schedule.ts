import type { ProtocolDesign } from "@/lib/schemas/protocol";

export type PhaseStatus = {
  phase: "A" | "B" | null;
  kind: "baseline" | "intervention" | null;
  dayInPhase: number;
  washout: boolean;
  done: boolean;
  started: boolean;
};

/** Whole UTC calendar days from `from` to `to` (date-only, ignores clock time). */
function utcDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((b - a) / 86_400_000);
}

const NOT_STARTED: PhaseStatus = {
  phase: null,
  kind: null,
  dayInPhase: 0,
  washout: false,
  done: false,
  started: false,
};

/**
 * Map today's date to the current ABA phase. Phases run in order with
 * `washoutDays` inserted between them; the user never picks a phase. Returns a
 * washout marker on rest days and `done` once the trial is over.
 */
export function currentPhase(
  startedAt: Date,
  design: ProtocolDesign,
  today: Date,
): PhaseStatus {
  const dayIndex = utcDaysBetween(startedAt, today);
  if (dayIndex < 0) return NOT_STARTED;

  let cursor = 0;
  const lastIndex = design.phases.length - 1;

  for (let i = 0; i < design.phases.length; i++) {
    const phase = design.phases[i];
    const phaseStart = cursor;
    const phaseEnd = cursor + phase.days - 1;
    if (dayIndex >= phaseStart && dayIndex <= phaseEnd) {
      return {
        phase: phase.label,
        kind: phase.kind,
        dayInPhase: dayIndex - phaseStart,
        washout: false,
        done: false,
        started: true,
      };
    }
    cursor = phaseEnd + 1;

    if (i < lastIndex && design.washoutDays > 0) {
      const washoutEnd = cursor + design.washoutDays - 1;
      if (dayIndex >= cursor && dayIndex <= washoutEnd) {
        return {
          phase: null,
          kind: null,
          dayInPhase: dayIndex - cursor,
          washout: true,
          done: false,
          started: true,
        };
      }
      cursor = washoutEnd + 1;
    }
  }

  return { phase: null, kind: null, dayInPhase: 0, washout: false, done: true, started: true };
}
