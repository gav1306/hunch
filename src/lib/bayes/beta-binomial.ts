import type { Belief } from "@/lib/schemas/belief";
import { normalCdf } from "@/lib/bayes/math";

/** A conjugate model producing a posterior belief from two arms of readings. */
export type BayesianModel = {
  update(a: number[], b: number[]): Belief;
};

/** Posterior mean and variance of a Beta(1+successes, 1+failures) arm. */
function betaMoments(values: number[]): { mean: number; variance: number } {
  const successes = values.reduce((s, v) => s + (v > 0.5 ? 1 : 0), 0);
  const failures = values.length - successes;
  const alpha = 1 + successes;
  const beta = 1 + failures;
  const total = alpha + beta;
  const mean = alpha / total;
  const variance = (alpha * beta) / (total * total * (total + 1));
  return { mean, variance };
}

/**
 * Beta-Binomial model for binary (0/1) outcomes. Each arm is Beta(1,1)-prior
 * updated by its successes/failures; the effect is the difference of arm rates,
 * approximated as Normal(meanB - meanA, varA + varB) so P(effect > 0) and the
 * 95% credible interval are closed-form and deterministic.
 */
export const betaBinomial: BayesianModel = {
  update(a, b) {
    const warming = a.length < 3 || b.length < 3;
    const ma = betaMoments(a);
    const mb = betaMoments(b);
    const effect = mb.mean - ma.mean;
    const sd = Math.sqrt(ma.variance + mb.variance);
    const pEffect = sd === 0 ? (effect > 0 ? 1 : effect < 0 ? 0 : 0.5) : normalCdf(effect / sd);
    return {
      pEffect,
      effect,
      ci: [effect - 1.96 * sd, effect + 1.96 * sd],
      nA: a.length,
      nB: b.length,
      model: "beta-binomial",
      state: warming ? "warming-up" : "live",
    };
  },
};
