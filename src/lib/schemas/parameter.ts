import { z } from "zod";

/**
 * How a parameter is logged. Four kinds, because a bug count, a 1-5 mood rating
 * and a systolic reading off a cuff are not one thing: they want different
 * controls, different validation, and different answers to the question that
 * decides whether a trial survives — can this person actually produce this
 * number every day?
 *
 * The Bayesian engine still sees only binary vs continuous. `engineOutcomeType`
 * in src/lib/parameters.ts is the single door between the two vocabularies.
 */
export const parameterTypeSchema = z.enum(["binary", "scale", "count", "amount"]);
export type ParameterType = z.infer<typeof parameterTypeSchema>;

/**
 * A rating scale is always 1-5. Five tap targets fit a phone row, and a person
 * rating their own energy is not precise to ten points — the Coach and the
 * Designer proved that by disagreeing about it inside a single trial.
 */
export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

/**
 * A co-variable the Coach proposes alongside the primary outcome — the
 * "alternative parameters or symptoms" the user logs daily for context.
 */
export const trackerSchema = z.object({
  label: z.string().trim().min(1),
  type: parameterTypeSchema,
  /** Display unit, e.g. "hrs", "1-10". */
  unit: z.string().trim().min(1).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});
export type Tracker = z.infer<typeof trackerSchema>;

/** One row of the confirm gate's editable list. */
export const parameterDraftSchema = trackerSchema.extend({
  /** The one parameter that drives the Bayesian verdict. */
  isPrimary: z.boolean().default(false),
});
export type ParameterDraft = z.infer<typeof parameterDraftSchema>;

/**
 * The confirmed set the user sends when they approve the plan: the primary
 * outcome plus up to four trackers, with exactly one primary.
 */
export const parameterListSchema = z
  .array(parameterDraftSchema)
  .min(1)
  .max(5)
  .refine((rows) => rows.filter((r) => r.isPrimary).length === 1, {
    message: "Exactly one parameter must be the primary outcome.",
  })
  .refine(
    (rows) => rows.every((r) => r.min === undefined || r.max === undefined || r.min < r.max),
    { message: "A parameter's lowest value must be below its highest." },
  );

/** A persisted parameter, as the API hands it to the client. */
export const parameterSchema = parameterDraftSchema.extend({
  id: z.string().min(1),
  sortOrder: z.number().int().min(0),
});
export type Parameter = z.infer<typeof parameterSchema>;

/**
 * What the client sends on a check-in: one reading per parameter it has a
 * value for. Phase and date stay server-derived; partial payloads are fine.
 */
export const checkInValuesInputSchema = z.object({
  values: z
    .array(z.object({ parameterId: z.string().min(1), value: z.number() }))
    .min(1),
  /**
   * The day being logged, when it isn't today. Sent as an ISO date by the
   * adherence strip when the user corrects an entry they got wrong or filled in
   * a day they missed. The server still decides whether that day is loggable —
   * this only says which one is meant.
   */
  loggedOn: z.iso.datetime().optional(),
});
export type CheckInValuesInput = z.infer<typeof checkInValuesInputSchema>;

/**
 * Is this reading loggable for this parameter? Returns null when it is, or a
 * user-facing reason when it is not. Shared by the check-in route and the UI so
 * both reject the same things with the same words.
 */
export function validateParameterValue(
  param: { label: string; type: ParameterType; min?: number | null; max?: number | null },
  value: number,
): string | null {
  if (!Number.isFinite(value)) return `${param.label} needs a number.`;

  if (param.type === "binary") {
    return value === 0 || value === 1 ? null : `${param.label} is a yes/no — log 1 or 0.`;
  }

  // A scale's bounds belong to the kind, not the row. Rows migrated off the old
  // free-number type can still carry min 1 / max 10, and honouring that would
  // let a 7 through a control that only offers five taps.
  if (param.type === "scale") {
    return Number.isInteger(value) && value >= SCALE_MIN && value <= SCALE_MAX
      ? null
      : `${param.label} is a ${SCALE_MIN}-${SCALE_MAX} rating.`;
  }

  if (param.type === "count") {
    if (!Number.isInteger(value)) return `${param.label} is a whole number.`;
    if (value < 0) return `${param.label} can't be negative.`;
  }

  if (param.min != null && value < param.min) {
    return `${param.label} can't be below ${param.min}.`;
  }
  if (param.max != null && value > param.max) {
    return `${param.label} can't be above ${param.max}.`;
  }
  return null;
}
