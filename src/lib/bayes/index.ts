import type { Belief } from "@/lib/schemas/belief";
import { betaBinomial, type BayesianModel } from "@/lib/bayes/beta-binomial";
import { normalNormal } from "@/lib/bayes/normal-normal";

export type { BayesianModel };
export { betaBinomial, normalNormal };

export type CheckInRow = { phase: string; value: number };

/**
 * Compute the live belief from the full check-in set. Baseline (phase "A")
 * readings form the A-arm, intervention (phase "B") readings the B-arm; the
 * model is chosen by the hypothesis outcome type. Pure function of its inputs —
 * this is what the GET /belief route recomputes on every read.
 */
export function computeBelief(
  checkIns: CheckInRow[],
  outcomeType: "binary" | "continuous",
): Belief {
  const a = checkIns.filter((c) => c.phase === "A").map((c) => c.value);
  const b = checkIns.filter((c) => c.phase === "B").map((c) => c.value);
  const model: BayesianModel = outcomeType === "binary" ? betaBinomial : normalNormal;
  return model.update(a, b);
}
