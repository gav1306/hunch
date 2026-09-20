import { z } from "zod";

/** The four outcomes of a concluded trial; `null` (still running) is not a stored category. */
export const verdictCategorySchema = z.enum([
  "helped",
  "hurt",
  "inconclusive_no_effect",
  "inconclusive_insufficient",
]);
export type VerdictCategory = z.infer<typeof verdictCategorySchema>;

/** The Analyst's structured output — prose only. */
export const verdictNarrativeSchema = z.object({
  narrative: z.string().trim().min(1),
});

/** The primary parameter, as the user labelled it. */
export const verdictOutcomeSchema = z.object({
  label: z.string().trim().min(1),
  unit: z.string().trim().min(1).optional(),
});

/**
 * The exposure counts for a hunch that carries a daily yes/no. `observational`
 * is true when those counts assigned the arms (an observational trial), and
 * false when they merely report adherence to a schedule that already did
 * (a phased or diary trial) — the copy layer reads this to decide whether it
 * can say anything about correlation.
 */
export const exposureReportSchema = z.object({
  label: z.string().trim().min(1),
  exposed: z.number().int().min(0),
  unexposed: z.number().int().min(0),
  unknown: z.number().int().min(0),
  /** True when these counts assigned the arms, rather than the schedule. */
  observational: z.boolean(),
});
export type ExposureReport = z.infer<typeof exposureReportSchema>;

/**
 * The verdict as returned by the API and rendered by the UI. `ci` is the 95%
 * credible interval on the effect; the numbers are the frozen engine snapshot.
 */
export const verdictSchema = z.object({
  category: verdictCategorySchema,
  /**
   * The primary parameter as the user labelled it, so the headline can name
   * what moved instead of saying "it". Absent on verdicts frozen before the
   * headline carried the outcome.
   */
  outcome: verdictOutcomeSchema.nullish(),
  narrative: z.string().trim().min(1),
  pEffect: z.number().min(0).max(1),
  effect: z.number(),
  ci: z.tuple([z.number(), z.number()]),
  nA: z.number().int().min(0),
  nB: z.number().int().min(0),
  model: z.enum(["beta-binomial", "normal-normal"]),
  /**
   * How many days the exposure happened, computed fresh from the check-ins on
   * every request — never frozen. Absent on verdicts concluded before the
   * exposure report existed, and on any hunch that never carried one.
   */
  exposure: exposureReportSchema.nullish(),
});
export type Verdict = z.infer<typeof verdictSchema>;
