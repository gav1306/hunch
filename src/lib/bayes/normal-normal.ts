import type { BayesianModel } from "@/lib/bayes/beta-binomial";
import { normalCdf } from "@/lib/bayes/math";

/** Smallest standard deviation we allow, so identical readings don't divide by zero. */
const MIN_SD = 1e-6;

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Normal-Normal model for continuous outcomes. With a vague prior the posterior
 * arm mean is the sample mean; σ is estimated empirically from the pooled sample
 * (MVP simplification — see the design spec). The effect is the difference of arm
 * means; its standard error gives a closed-form P(effect > 0) and 95% interval.
 */
export const normalNormal: BayesianModel = {
  update(a, b) {
    const warming = a.length < 3 || b.length < 3;
    const pooled = [...a, ...b];
    const pooledMean = mean(pooled);
    const variance =
      pooled.length > 1
        ? pooled.reduce((s, v) => s + (v - pooledMean) ** 2, 0) / (pooled.length - 1)
        : 0;
    const sd = Math.max(Math.sqrt(variance), MIN_SD);

    const effect = mean(b) - mean(a);
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
