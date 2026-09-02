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
