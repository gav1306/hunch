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

/**
 * The verdict as returned by the API and rendered by the UI. `ci` is the 95%
 * credible interval on the effect; the numbers are the frozen engine snapshot.
 */
export const verdictSchema = z.object({
  category: verdictCategorySchema,
  narrative: z.string().trim().min(1),
  pEffect: z.number().min(0).max(1),
  effect: z.number(),
  ci: z.tuple([z.number(), z.number()]),
  nA: z.number().int().min(0),
  nB: z.number().int().min(0),
  model: z.enum(["beta-binomial", "normal-normal"]),
});
export type Verdict = z.infer<typeof verdictSchema>;
