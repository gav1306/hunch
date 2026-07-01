import type { BayesianModel } from "@/lib/bayes/beta-binomial";
import { normalCdf } from "@/lib/bayes/math";

/** Smallest standard deviation we allow, so identical readings don't divide by zero. */
const MIN_SD = 1e-6;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Sum of squared deviations of `values` from their own mean. */
function sumSquaredDev(values: number[], m: number): number {
  return values.reduce((s, v) => s + (v - m) ** 2, 0);
}

/**
 * Normal-Normal model for continuous outcomes. With a vague prior the posterior
 * arm mean is the sample mean; σ is the within-group pooled standard deviation
 * (deviations measured from each arm's own mean, not the grand mean — otherwise a
 * real between-arm effect is counted as noise and the interval balloons). The
 * effect is the difference of arm means; its standard error gives a closed-form
 * P(effect > 0) and 95% interval.
 */
export const normalNormal: BayesianModel = {
  update(a, b) {
    const warming = a.length < 3 || b.length < 3;
    const meanA = mean(a);
    const meanB = mean(b);
    // Within-group pooled variance: total squared deviation from each arm's own
    // mean, over the residual degrees of freedom (nA + nB - 2).
    const dof = a.length + b.length - 2;
    const variance =
      dof > 0 ? (sumSquaredDev(a, meanA) + sumSquaredDev(b, meanB)) / dof : 0;
    const sd = Math.max(Math.sqrt(variance), MIN_SD);

    const effect = meanB - meanA;
    const nA = a.length || 1;
    const nB = b.length || 1;
    const se = sd * Math.sqrt(1 / nA + 1 / nB);
    const pEffect = normalCdf(effect / se);

    return {
      pEffect,
      effect,
      ci: [effect - 1.96 * se, effect + 1.96 * se],
      nA: a.length,
      nB: b.length,
      model: "normal-normal",
      state: warming ? "warming-up" : "live",
    };
  },
};
