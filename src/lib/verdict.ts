import type { Belief } from "@/lib/schemas/belief";
import type { PhaseStatus } from "@/lib/schedule";
import type { VerdictCategory } from "@/lib/schemas/verdict";

/** Minimum check-ins per arm before a verdict is trustworthy (matches the Phase 4 warming-up floor). */
const MIN_PER_ARM = 3;

/**
 * Classify a concluded trial's belief into a verdict category. Pure and
 * deterministic — the LLM never decides this. Returns null while the schedule
 * is still running (or absent). A "clear" verdict requires the 95% credible
 * interval to exclude zero, exactly the rule the belief meter draws; a bound
 * touching zero counts as straddling.
 */
export function classifyVerdict(
  belief: Belief,
  schedule: PhaseStatus | null,
): VerdictCategory | null {
  if (!schedule || !schedule.done) return null;
  if (belief.nA < MIN_PER_ARM || belief.nB < MIN_PER_ARM) {
    return "inconclusive_insufficient";
  }
  const [low, high] = belief.ci;
  if (low > 0) return "helped";
  if (high < 0) return "hurt";
  return "inconclusive_no_effect";
}
