import { z } from "zod";

/**
 * The Bayesian engine's posterior summary. `pEffect` is P(intervention mean >
 * baseline mean); `ci` is the 95% credible interval on the effect. `warming-up`
 * means an arm has < 3 observations and the numbers are not yet trustworthy.
 */
export const beliefSchema = z.object({
  pEffect: z.number().min(0).max(1),
  effect: z.number(),
  ci: z.tuple([z.number(), z.number()]),
  nA: z.number().int().min(0),
  nB: z.number().int().min(0),
  model: z.enum(["beta-binomial", "normal-normal"]),
  state: z.enum(["warming-up", "live"]),
});
export type Belief = z.infer<typeof beliefSchema>;
