import type { CheckInRow } from "@/lib/bayes";
import type {
  Parameter,
  ParameterDraft,
  ParameterType,
  Tracker,
} from "@/lib/schemas/parameter";
import type { ProtocolShape } from "@/lib/schemas/protocol";

/** A day's check-in with its per-parameter readings, as read from the DB. */
export type CheckInWithValues = {
  phase: string;
  values: { parameterId: string; value: number }[];
};

/** A Parameter row exactly as Prisma hands it back. */
export type ParameterRow = {
  id: string;
  label: string;
  type: string;
  unit: string | null;
  min: number | null;
  max: number | null;
  isPrimary: boolean;
  isExposure: boolean;
  sortOrder: number;
  retiredAt: Date | null;
};

/**
 * DB row -> API DTO. Prisma nulls become undefined so the client's parameter
 * schemas (which treat unit/min/max as optional) validate what we send back —
 * a stray null would otherwise fail the confirm gate's design check.
 */
export function toParameterDto(row: ParameterRow): Parameter {
  return {
    id: row.id,
    label: row.label,
    type: row.type as ParameterType,
    unit: row.unit ?? undefined,
    min: row.min ?? undefined,
    max: row.max ?? undefined,
    isPrimary: row.isPrimary,
    isExposure: row.isExposure,
    sortOrder: row.sortOrder,
    retired: row.retiredAt !== null,
  };
}

/** Case-insensitive label match — trackers must not restate the primary. */
function sameLabel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The starting parameter set for a freshly sharpened hunch: the outcome metric
 * as the primary, then (when the hunch carries one) the exposure — the daily
 * yes/no an observational trial derives its arms from — then the Coach's
 * proposed trackers. Duplicates of the primary, and of the exposure, are
 * dropped so the user never sees the same row twice. Trackers are capped at
 * four normally, three when an exposure is present, so the total never
 * exceeds `MAX_ACTIVE_PARAMETERS`.
 */
export function draftsFromSharpened(s: {
  outcomeMetric: string;
  /** The hypothesis' own word — the engine's vocabulary, not a kind. */
  outcomeType: "binary" | "continuous";
  trackers?: Tracker[];
  /** The daily yes/no, present only for a hunch that can't be scheduled. */
  exposure?: Tracker;
}): ParameterDraft[] {
  const primary: ParameterDraft = {
    label: s.outcomeMetric,
    // The Coach reports the outcome in the engine's two-value vocabulary, so a
    // primary arrives as "continuous". Land it on `amount` — the free number
    // input these rows already rendered — rather than guessing a rating or a
    // stepper for a measure nobody has described yet.
    type: s.outcomeType === "binary" ? "binary" : "amount",
    isPrimary: true,
    isExposure: false,
  };

  const exposure: ParameterDraft | null =
    s.exposure && !sameLabel(s.exposure.label, s.outcomeMetric)
      ? { ...s.exposure, isPrimary: false, isExposure: true }
      : null;

  const trackerCap = exposure ? 3 : 4;
  const trackers = (s.trackers ?? [])
    .filter((t) => !sameLabel(t.label, s.outcomeMetric))
    .filter((t) => !exposure || !sameLabel(t.label, exposure.label))
    .slice(0, trackerCap)
    .map((t) => ({ ...t, isPrimary: false, isExposure: false }));

  return exposure ? [primary, exposure, ...trackers] : [primary, ...trackers];
}

/** The one parameter that drives the verdict, or null when the set has none. */
export function pickPrimary<T extends { isPrimary: boolean }>(rows: T[]): T | null {
  return rows.find((r) => r.isPrimary) ?? null;
}

/**
 * Project day-buckets down to what the Bayesian engine consumes: the primary
 * reading per day, tagged with the arm that day belongs to.
 *
 * The arm is derived here and never stored. `CheckIn.phase` is the calendar's
 * answer — the check-in route writes whatever the schedule says the date is —
 * and on an observational trial that label carries no arm meaning at all.
 * Deriving is also what makes a correction work: the adherence strip lets a
 * user fix yesterday's "did I play?", and a stored arm would go stale the
 * moment they did.
 *
 * Secondary trackers are dropped here — they never reach the statistics.
 */
export function armRows(
  checkIns: CheckInWithValues[],
  primaryId: string | null | undefined,
  opts: { shape: ProtocolShape; exposureId?: string | null } = { shape: "phased" },
): CheckInRow[] {
  if (!primaryId) return [];
  if (opts.shape === "observational" && !opts.exposureId) return [];

  const rows: CheckInRow[] = [];
  for (const c of checkIns) {
    const primaryHit = c.values.find((v) => v.parameterId === primaryId);
    if (!primaryHit) continue;

    if (opts.shape === "observational") {
      const exposureHit = c.values.find((v) => v.parameterId === opts.exposureId);
      // An unanswered exposure is not a "no" — treating it as one would stuff
      // every lazy check-in into the baseline arm and bias the result towards
      // whatever the user does when they cannot be bothered to log.
      if (!exposureHit) continue;
      rows.push({ phase: exposureHit.value === 1 ? "B" : "A", value: primaryHit.value });
    } else {
      rows.push({ phase: c.phase, value: primaryHit.value });
    }
  }
  return rows;
}

/**
 * The only place a parameter kind becomes something the Bayesian engine
 * understands. `computeBelief` takes binary or continuous; scale, count and
 * amount are all continuous to the maths, and what separates them is how a
 * number is asked for, not how it is analysed.
 *
 * This exists because four call sites used to write
 * `primary.type as "binary" | "continuous"`. That cast stopped TypeScript
 * checking exactly where a new kind would first arrive, and the engine would
 * have picked its model from a string nobody had validated.
 *
 * Only "binary" is binary. Everything else — a legacy "continuous" row, a new
 * kind, an unrecognised string — is continuous, because treating a real
 * measurement as a coin flip would silently corrupt a verdict, while the
 * reverse merely widens an interval.
 */
export function engineOutcomeType(
  type: string | null | undefined,
): "binary" | "continuous" {
  return type === "binary" ? "binary" : "continuous";
}

/** "1-10", "1 - 5", "1–10" — a unit that is really a rating range. */
const RATING_UNIT = /^\d+\s*[-–]\s*\d+$/;

/**
 * The kind an existing row becomes when the four kinds land. Mirrored in SQL by
 * the parameter_kinds migration; change both together or the database and the
 * code disagree about rows nobody has touched since.
 *
 * Deliberately conservative. Anything not clearly a rating becomes an `amount`,
 * which is the free number input the row already rendered — the spec's original
 * "count otherwise" would have turned "hours of sleep" into a stepper and
 * changed a control under someone mid-trial.
 */
export function backfillKind(row: {
  type: string;
  unit: string | null;
  min: number | null;
  max: number | null;
}): ParameterType {
  if (row.type === "binary") return "binary";
  if (row.unit && RATING_UNIT.test(row.unit.trim())) return "scale";
  return "amount";
}

/**
 * The parameters still being logged. Retired rows stay in the database and in
 * the export — a column that stops halfway is the honest record of a trial —
 * but nothing asks the user for them again.
 */
export function activeParameters<T extends { retiredAt: Date | null }>(rows: T[]): T[] {
  return rows.filter((r) => r.retiredAt === null);
}
