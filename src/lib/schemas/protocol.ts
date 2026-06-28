import { z } from "zod";

/**
 * A factor that could independently move the outcome during the experiment,
 * plus the deterministic control we bake into the protocol (surface-and-warn).
 * Stored structured on Protocol so Phase 4 can statistically adjust later.
 */
export const confounderSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["behavioral", "physiological", "environmental"]),
  expectedDirection: z.enum(["increases", "decreases", "unknown"]),
  /** Plain-language instruction that holds this confounder constant. */
  control: z.string().trim().min(1),
});
export type Confounder = z.infer<typeof confounderSchema>;

/** One phase of an n-of-1 design. ABA = baseline, intervention, baseline. */
export const protocolPhaseSchema = z.object({
  label: z.enum(["A", "B"]),
  kind: z.enum(["baseline", "intervention"]),
  days: z.number().int().positive(),
});
export type ProtocolPhase = z.infer<typeof protocolPhaseSchema>;

/**
 * The experiment design. v1 emits ABA (three phases); the shape is left
 * general (>= 2 phases) so randomized blocks can land later without a change.
 */
export const protocolDesignSchema = z.object({
  phases: z.array(protocolPhaseSchema).min(2),
  washoutDays: z.number().int().min(0),
  controls: z.array(z.string().trim().min(1)),
  instructions: z.string().trim().min(1),
});
export type ProtocolDesign = z.infer<typeof protocolDesignSchema>;

/** Output of the deterministic power-analysis tool. */
export const powerInfoSchema = z.object({
  minDaysPerPhase: z.number().int().positive(),
  effectSize: z.enum(["small", "medium", "large"]),
  rationale: z.string().trim().min(1),
});
export type PowerInfo = z.infer<typeof powerInfoSchema>;

/** The Safety Reviewer's verdict. The gate. */
export const safetyVerdictSchema = z.object({
  state: z.enum(["approved", "refused"]),
  reason: z.string().trim().min(1),
  routedToDoctor: z.boolean(),
});
export type SafetyVerdict = z.infer<typeof safetyVerdictSchema>;

/** The composed output of the design workflow. */
export const designResultSchema = z.object({
  confounders: z.array(confounderSchema),
  design: protocolDesignSchema,
  powerInfo: powerInfoSchema,
  safety: safetyVerdictSchema,
});
export type DesignResult = z.infer<typeof designResultSchema>;
