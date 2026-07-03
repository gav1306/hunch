import { z } from "zod";

/**
 * A recalled past finding, surfaced when a related new hunch is created. The
 * fields mirror a stored CausalEdge; `cause` is the sharpened hypothesis
 * statement, `effect` the outcome metric, `direction` the verdict's sign.
 */
export const priorSchema = z.object({
  cause: z.string().trim().min(1),
  effect: z.string().trim().min(1),
  direction: z.enum(["increases", "decreases", "none"]),
  effectSize: z.number(),
  confidence: z.number().min(0).max(1),
  sourceHunchId: z.string().trim().min(1),
});
export type Prior = z.infer<typeof priorSchema>;

/** The memory agent's structured output: which candidate findings are relevant. */
export const recallResultSchema = z.object({
  relatedSourceHunchIds: z.array(z.string()),
});
export type RecallResult = z.infer<typeof recallResultSchema>;
