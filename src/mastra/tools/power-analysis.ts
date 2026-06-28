import type { PowerInfo } from "@/lib/schemas/protocol";

/**
 * Deterministic trial-length heuristic for n-of-1 designs (RULES §3 — no LLM
 * math). This is a defensible heuristic, NOT a formal frequentist power
 * calculation: binary outcomes need more observations than continuous ones to
 * separate signal from noise, and smaller expected effects need longer phases.
 * The honest framing lands in `rationale` and the eventual verdict.
 */
const BASE_DAYS = { binary: 14, continuous: 7 } as const;
const EFFECT_MULTIPLIER = { small: 2, medium: 1, large: 0.5 } as const;
const MIN_DAYS = 3;

export function estimateTrialLength(input: {
  outcomeType: "binary" | "continuous";
  effectSize?: "small" | "medium" | "large";
}): PowerInfo {
  const effectSize = input.effectSize ?? "medium";
  const minDaysPerPhase = Math.max(
    MIN_DAYS,
    Math.ceil(BASE_DAYS[input.outcomeType] * EFFECT_MULTIPLIER[effectSize]),
  );

  return {
    minDaysPerPhase,
    effectSize,
    rationale:
      `A ${input.outcomeType} outcome with a ${effectSize} expected effect needs ` +
      `about ${minDaysPerPhase} days per phase to gather enough signal. This is a ` +
      `rule-of-thumb to keep the trial honest, not a formal power calculation.`,
  };
}
