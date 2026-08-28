import { currentPhase, utcDaysBetween } from "@/lib/schedule";
import type { ProtocolDesign } from "@/lib/schemas/protocol";

/**
 * What happened on each day of a trial.
 *
 * Home can tell you a trial is on day 9 of 14. It cannot tell you whether those
 * nine days hold nine readings or two — which is the difference between a
 * verdict and a guess, and the thing the app collects every day and has never
 * shown anyone.
 */
export type DayState = "logged" | "missed" | "rest" | "today" | "future";

export type AdherenceDay = {
  /** UTC midnight of this day — the key `CheckIn.loggedOn` is filed under. */
  date: Date;
  /** 1-based day of the trial, washouts included. */
  day: number;
  phase: "A" | "B" | null;
  kind: "baseline" | "intervention" | null;
  /** Which entry of `design.phases`, since an ABA design repeats its labels. */
  phaseIndex: number | null;
  state: DayState;
};

/** How long the whole design runs, washouts included. */
export function totalDays(design: ProtocolDesign): number {
  const phaseDays = design.phases.reduce((n, p) => n + p.days, 0);
  const gaps = Math.max(0, design.phases.length - 1) * design.washoutDays;
  return phaseDays + gaps;
}

/**
 * One entry per day of the trial, from day 1 to the last.
 *
 * A rest day is never "missed" — there is nothing to log on it — and neither is
 * today, which isn't over yet. Both of those would otherwise read as a failure
 * the user can do nothing about, on a strip whose whole job is to be honest
 * about the ones they can.
 */
export function adherenceStrip({
  startedAt,
  design,
  loggedOn,
  today,
}: {
  startedAt: Date;
  design: ProtocolDesign;
  /** The days that carry a check-in, at UTC midnight. */
  loggedOn: Date[];
  today: Date;
}): AdherenceDay[] {
  const logged = new Set(loggedOn.map((d) => d.getTime()));
  const elapsed = utcDaysBetween(startedAt, today);

  return Array.from({ length: totalDays(design) }, (_, i) => {
    const date = new Date(startedAt.getTime() + i * 86_400_000);
    const status = currentPhase(startedAt, design, date);
    const isRest = status.washout;
    const isLogged = logged.has(date.getTime());

    let state: DayState;
    if (isLogged) state = "logged";
    else if (i > elapsed) state = "future";
    else if (i === elapsed) state = isRest ? "rest" : "today";
    else if (isRest) state = "rest";
    else state = "missed";

    return {
      date,
      day: i + 1,
      phase: status.phase,
      kind: status.kind,
      phaseIndex: status.phaseIndex,
      state,
    };
  });
}

/**
 * The strip in one line: how many of the loggable days that have already
 * passed were actually logged. Today is excluded either way — counting it as
 * missed at 9am is a lie, and counting it as logged is a different one.
 */
export function adherenceSummary(strip: AdherenceDay[]): {
  logged: number;
  missed: number;
  elapsed: number;
} {
  let logged = 0;
  let missed = 0;
  for (const d of strip) {
    if (d.state === "logged") logged++;
    else if (d.state === "missed") missed++;
  }
  return { logged, missed, elapsed: logged + missed };
}
