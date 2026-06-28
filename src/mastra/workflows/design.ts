import {
  designResultSchema,
  type DesignResult,
  type SafetyVerdict,
} from "@/lib/schemas/protocol";
import { detectConfounders } from "@/mastra/tools/confounder-detection";
import { estimateTrialLength } from "@/mastra/tools/power-analysis";
import { designProtocolShape } from "@/mastra/agents/protocol-designer";
import { reviewSafety } from "@/mastra/agents/safety-reviewer";

/**
 * Master switch for auto-approval (RULES §6). The safety eval
 * (safety-reviewer.eval.test.ts) is the gate that proves it is safe to leave
 * this `true`. If that eval regresses, the owner flips this to `false`; every
 * approved verdict then persists as "pending" (manual confirm) instead of
 * auto-running. There is never silent auto-approval when the gate is red.
 */
export const AUTO_APPROVE_ENABLED = true;

/** Map a reviewer verdict + the gate switch to the persisted safetyState. */
export function resolveSafetyState(
  verdict: SafetyVerdict,
  autoApprove: boolean = AUTO_APPROVE_ENABLED,
): "approved" | "refused" | "pending" {
  if (verdict.state === "refused") return "refused";
  return autoApprove ? "approved" : "pending";
}

/**
 * The design workflow: structure confounders -> size the trial -> design the
 * ABA protocol -> safety-review it. Pure orchestration; persistence and gate
 * enforcement live in the API route.
 */
export async function designProtocol(input: {
  statement: string;
  outcomeMetric: string;
  outcomeType: "binary" | "continuous";
  confounderNames: string[];
  effectSize?: "small" | "medium" | "large";
}): Promise<DesignResult> {
  const confounders = detectConfounders(input.confounderNames);
  const powerInfo = estimateTrialLength({
    outcomeType: input.outcomeType,
    effectSize: input.effectSize,
  });
  const design = await designProtocolShape({
    statement: input.statement,
    outcomeMetric: input.outcomeMetric,
    outcomeType: input.outcomeType,
    confounders,
    power: powerInfo,
  });
  const safety = await reviewSafety({ statement: input.statement, design });

  return designResultSchema.parse({ confounders, design, powerInfo, safety });
}
