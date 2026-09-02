import type { CheckInRow } from "@/lib/bayes";
import type {
  Parameter,
  ParameterDraft,
  ParameterType,
  Tracker,
} from "@/lib/schemas/parameter";

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
 * as the primary, then the Coach's proposed trackers. Capped at four trackers;
 * duplicates of the primary are dropped so the user never sees the same row twice.
 */
export function draftsFromSharpened(s: {
  outcomeMetric: string;
  /** The hypothesis' own word — the engine's vocabulary, not a kind. */
  outcomeType: "binary" | "continuous";
  trackers?: Tracker[];
}): ParameterDraft[] {
  const primary: ParameterDraft = {
    label: s.outcomeMetric,
    // The Coach reports the outcome in the engine's two-value vocabulary, so a
    // primary arrives as "continuous". Land it on `amount` — the free number
    // input these rows already rendered — rather than guessing a rating or a
    // stepper for a measure nobody has described yet.
    type: s.outcomeType === "binary" ? "binary" : "amount",
    isPrimary: true,
  };
  const trackers = (s.trackers ?? [])
    .filter((t) => !sameLabel(t.label, s.outcomeMetric))
    .slice(0, 4)
    .map((t) => ({ ...t, isPrimary: false }));
  return [primary, ...trackers];
}

/** The one parameter that drives the verdict, or null when the set has none. */
export function pickPrimary<T extends { isPrimary: boolean }>(rows: T[]): T | null {
  return rows.find((r) => r.isPrimary) ?? null;
}

/**
 * Project day-buckets down to what the Bayesian engine consumes: the primary
 * parameter's reading per day, tagged with that day's phase. Secondary trackers
 * are dropped here — they never reach the statistics.
 */
export function primaryBeliefRows(
  checkIns: CheckInWithValues[],
  primaryId: string | null | undefined,
): CheckInRow[] {
  if (!primaryId) return [];
  const rows: CheckInRow[] = [];
  for (const c of checkIns) {
    const hit = c.values.find((v) => v.parameterId === primaryId);
    if (hit) rows.push({ phase: c.phase, value: hit.value });
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
