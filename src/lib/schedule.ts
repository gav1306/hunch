import type { ProtocolDesign } from "@/lib/schemas/protocol";

export type PhaseStatus = {
  phase: "A" | "B" | null;
  kind: "baseline" | "intervention" | null;
  /**
   * Which entry of `design.phases` we're in. An ABA design repeats the "A"
   * label, so the label alone can't identify the phase — the returned baseline
   * has its own name and action, and looking it up by label finds the first.
   */
  phaseIndex: number | null;
  dayInPhase: number;
  washout: boolean;
  done: boolean;
  started: boolean;
};

/** Whole UTC calendar days from `from` to `to` (date-only, ignores clock time). */
export function utcDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((b - a) / 86_400_000);
}

/** Midnight UTC on the calendar day `d` falls in. */
export function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** When the user wants day 1 to fall. */
export type StartOn = "today" | "tomorrow";

/**
 * The anchor a trial carries once the user starts it.
 *
 * Normalised to UTC midnight because every reader downstream compares calendar
 * days, never clock time — `currentPhase`, home's day counter, and the
 * `loggedOn` key a check-in is filed under. Stamping the wall clock instead
 * (which is what the design POST used to do) makes day 1 a partial day whose
 * length depends on what time the design finished.
 *
 * "tomorrow" is a real anchor in the future, not a deferred write: `currentPhase`
 * already reports a negative day index as not-started, so the trial simply has
 * no loggable day until the date arrives.
 */
export function startDateFor(startOn: StartOn, now: Date = new Date()): Date {
  const today = utcMidnight(now);
  return startOn === "today" ? today : new Date(today.getTime() + 86_400_000);
}

const NOT_STARTED: PhaseStatus = {
  phase: null,
  kind: null,
  phaseIndex: null,
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
        phaseIndex: i,
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
          phaseIndex: null,
          dayInPhase: dayIndex - cursor,
          washout: true,
          done: false,
          started: true,
        };
      }
      cursor = washoutEnd + 1;
    }
  }

  return {
    phase: null,
    kind: null,
    phaseIndex: null,
    dayInPhase: 0,
    washout: false,
    done: true,
    started: true,
  };
}

/**
 * Is the day of grace after the schedule over? The last scheduled day can still
 * be filled in the morning after, so a trial only stops taking check-ins — and
 * the nightly sweep only freezes its verdict — once the schedule had already
 * ended by yesterday. `today` is the user's own day, as a UTC-midnight key.
 */
export function graceOver(startedAt: Date, design: ProtocolDesign, today: Date): boolean {
  const yesterday = new Date(today.getTime() - 86_400_000);
  return currentPhase(startedAt, design, yesterday).done;
}

/**
 * The phase's kind as the user reads it. The closing A of an A-B-A trial is a
 * baseline in kind, but it's a return to the routine rather than the start of
 * the trial, and calling it "baseline" again reads as if the trial restarted.
 */
export function phaseKindLabel(
  kind: "baseline" | "intervention",
  phaseIndex: number,
): "baseline" | "intervention" | "back to baseline" {
  if (kind === "intervention") return "intervention";
  return phaseIndex > 0 ? "back to baseline" : "baseline";
}
