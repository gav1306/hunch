/**
 * The mid-trial safety net: three deterministic checks on a reading as it is
 * logged.
 *
 * **No model call anywhere in this file, deliberately.** An LLM deciding
 * whether someone should see a doctor is the exact thing this app must not do.
 * Every threshold here is arithmetic or a published number with a citation.
 *
 * A flag never blocks the reading — the day is logged first, and this only
 * notices. It is never stored either, which is what guarantees it cannot reach
 * the Bayesian engine, a verdict, or a CausalEdge: there is nowhere for it to
 * persist. The user is told once and decides for themselves.
 */

export type ReadingFlag = {
  kind: "typo" | "outlier" | "limit";
  /** What the user reads. No diagnosis, no instruction. */
  message: string;
  /** For a typo: the number we think they meant. */
  suggestion?: number;
  /** For a limit: where the number comes from. */
  source?: string;
};

export type FlaggableParameter = {
  label: string;
  type: string;
  unit: string | null;
  min: number | null;
  max: number | null;
};

/** At least this many prior readings before a spread is a spread. */
const MIN_HISTORY = 7;

/** How many standard deviations from their own mean counts as unusual. */
const OUTLIER_SIGMAS = 3;

/**
 * Published limits, with sources. These are the only values in the app that
 * come from outside the user's own data, and they exist so that a reading in
 * genuinely urgent territory is not met with silence.
 *
 * They are informational thresholds, not a diagnosis: the message names the
 * number and where it came from, and stops there.
 */
const BP_SYSTOLIC = {
  high: 180,
  low: 90,
  source: "ACC/AHA hypertensive-crisis threshold",
};
const BP_DIASTOLIC = { high: 120, source: "ACC/AHA hypertensive-crisis threshold" };
const GLUCOSE_MGDL = { high: 300, low: 70, source: "ADA hyper/hypoglycaemia thresholds" };

function looksLike(parameter: FlaggableParameter, ...needles: string[]): boolean {
  const hay = `${parameter.label} ${parameter.unit ?? ""}`.toLowerCase();
  return needles.some((n) => hay.includes(n));
}

/** Blood pressure and glucose are the only measures with limits here. */
function isSystolic(p: FlaggableParameter): boolean {
  return looksLike(p, "mmhg") && !looksLike(p, "diastolic");
}
function isDiastolic(p: FlaggableParameter): boolean {
  return looksLike(p, "diastolic");
}
function isGlucose(p: FlaggableParameter): boolean {
  return looksLike(p, "mg/dl", "glucose", "blood sugar");
}

/**
 * Did they slip a digit? Only answered when the parameter has bounds and
 * dropping the last digit lands the value back inside them — otherwise we would
 * be inventing a correction rather than spotting a keystroke.
 */
export function typoFlag(p: FlaggableParameter, value: number): ReadingFlag | null {
  if (p.min == null || p.max == null) return null;
  if (value <= p.max && value >= p.min) return null;
  if (value <= p.max * 2) return null;

  const dropped = Math.floor(Math.abs(value) / 10);
  if (dropped < p.min || dropped > p.max) return null;

  return {
    kind: "typo",
    message: `Did you mean ${dropped}? You logged ${value} for ${p.label}.`,
    suggestion: dropped,
  };
}

function limitFlag(p: FlaggableParameter, value: number): ReadingFlag | null {
  if (p.type !== "amount") return null;

  const named = (n: number, source: string, direction: "above" | "below"): ReadingFlag => ({
    kind: "limit",
    message: `${value} is ${direction} ${n}, the point published guidance treats as urgent.`,
    source,
  });

  if (isDiastolic(p)) {
    if (value >= BP_DIASTOLIC.high) return named(BP_DIASTOLIC.high, BP_DIASTOLIC.source, "above");
    return null;
  }
  if (isSystolic(p)) {
    if (value >= BP_SYSTOLIC.high) return named(BP_SYSTOLIC.high, BP_SYSTOLIC.source, "above");
    if (value <= BP_SYSTOLIC.low) return named(BP_SYSTOLIC.low, BP_SYSTOLIC.source, "below");
    return null;
  }
  if (isGlucose(p)) {
    if (value >= GLUCOSE_MGDL.high) return named(GLUCOSE_MGDL.high, GLUCOSE_MGDL.source, "above");
    if (value <= GLUCOSE_MGDL.low) return named(GLUCOSE_MGDL.low, GLUCOSE_MGDL.source, "below");
  }
  return null;
}

/**
 * Unusual for *them*. The only claim their own data can support — it says
 * nothing about whether the number is good, bad, or worth acting on.
 */
function outlierFlag(
  p: FlaggableParameter,
  value: number,
  history: number[],
): ReadingFlag | null {
  if (history.length < MIN_HISTORY) return null;

  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const variance =
    history.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (history.length - 1);
  const sd = Math.sqrt(variance);
  if (sd === 0) return value === mean ? null : flatHistory(p, value, mean);

  if (Math.abs(value - mean) <= OUTLIER_SIGMAS * sd) return null;
  return {
    kind: "outlier",
    message: `That's unusual for you — your other ${p.label.toLowerCase()} readings sit around ${round(mean)}.`,
  };
}

/** Every prior reading identical: any different value is unusual by definition. */
function flatHistory(p: FlaggableParameter, value: number, mean: number): ReadingFlag {
  return {
    kind: "outlier",
    message: `That's unusual for you — every other ${p.label.toLowerCase()} reading has been ${round(mean)}.`,
  };
}

function round(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * The one reading, checked.
 *
 * Precedence is typo, then limit, then outlier. A slipped digit that lands past
 * a published limit is a keystroke, and telling someone to see a doctor about a
 * keystroke would be both wrong and alarming.
 */
/**
 * The one reading, checked — for the flags that apply to a reading the app has
 * accepted.
 *
 * The typo check is not here. A slipped digit puts the value outside the
 * parameter's own bounds, so `validateParameterValue` already refuses it and
 * the day is not written — which is right, because storing 1200 mmHg would
 * corrupt the trial. Its help belongs in that refusal instead, and the route
 * uses `typoFlag` there. See the check-in route.
 *
 * Precedence here is limit, then outlier: a published threshold is the more
 * specific statement, and saying both would be saying the same thing twice.
 */
export function flagReading(input: {
  parameter: FlaggableParameter;
  value: number;
  history: number[];
}): ReadingFlag | null {
  const { parameter, value, history } = input;
  return limitFlag(parameter, value) ?? outlierFlag(parameter, value, history);
}
