import { createHash } from "node:crypto";
import { engineOutcomeType } from "@/lib/parameters";
import type { designProtocol } from "@/mastra/workflows/design";

/**
 * Which logic made a design. Bump it whenever a design prompt, a design model,
 * or the code that assembles a design changes (src/mastra/agents/
 * protocol-designer.ts, safety-reviewer.ts, src/mastra/workflows/design.ts), so
 * a draft made by older logic is never served. Lives here rather than beside
 * `designProtocol` so this module stays free of the agents.
 */
export const DESIGN_VERSION = 1;

export type DesignInput = Parameters<typeof designProtocol>[0];

/**
 * The one way to turn a stored hypothesis plus the shape choice into the
 * design workflow's input. `predesign` calls it from stored rows and the
 * protocol route from what the user confirmed; sharing it is what makes their
 * fingerprints agree.
 */
export function designInputFor(
  hypothesis: { statement: string; outcomeMetric: string; outcomeType: string; confounders: string[] },
  choice: { schedulable: boolean; exposureLabel?: string },
): DesignInput {
  const observational = !choice.schedulable;
  return {
    statement: hypothesis.statement,
    outcomeMetric: hypothesis.outcomeMetric,
    outcomeType: engineOutcomeType(hypothesis.outcomeType),
    confounderNames: hypothesis.confounders,
    shape: observational ? "observational" : "phased",
    // A phased design never reads the label; leaving it out keeps a renamed
    // adherence tracker from invalidating a draft it doesn't affect.
    exposureLabel: observational ? choice.exposureLabel?.trim() : undefined,
  };
}

/**
 * Everything a design depends on, hashed. The tracker list is deliberately not
 * an input: editing trackers on the confirm gate changes no design.
 */
export function designFingerprint(input: DesignInput): string {
  const shape = input.shape ?? "phased";
  const canonical = JSON.stringify([
    DESIGN_VERSION,
    input.statement,
    input.outcomeMetric,
    input.outcomeType,
    input.confounderNames,
    shape,
    shape === "observational" ? (input.exposureLabel ?? "").trim() : null,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}
