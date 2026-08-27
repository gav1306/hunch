import { z } from "zod";

/** How a parameter is logged: a yes/no tap or a number. */
export const parameterTypeSchema = z.enum(["binary", "continuous"]);
export type ParameterType = z.infer<typeof parameterTypeSchema>;

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
  if (param.min != null && value < param.min) {
    return `${param.label} can't be below ${param.min}.`;
  }
  if (param.max != null && value > param.max) {
    return `${param.label} can't be above ${param.max}.`;
  }
  return null;
}
