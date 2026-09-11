import { z } from "zod";
import { trackerSchema } from "@/lib/schemas/parameter";

/**
 * Free-text "hunch" the user drops in. The starting point of the core loop.
 */
export const hunchInputSchema = z.object({
  rawText: z.string().trim().min(1, "A hunch can't be empty."),
});

export type HunchInput = z.infer<typeof hunchInputSchema>;

/**
 * The Hypothesis Coach's output: a vague hunch sharpened into a falsifiable,
 * measurable hypothesis. Mirrors the Hypothesis Prisma model (RESEARCH §5).
 *
 * This is the shape without the cross-field rules. It is what the Coach's
 * structured output is validated against: Mastra validates through the
 * standard-schema interface, which runs zod refinements, so handing it the
 * refined schema would throw on "unschedulable, no yes/no" before the Coach's
 * fallback could repair it. Everything else should use
 * `sharpenedHypothesisSchema`.
 */
export const sharpenedHypothesisObjectSchema = z.object({
  /** A single falsifiable claim. */
  statement: z.string().trim().min(1),
  /** What gets measured, and how. */
  outcomeMetric: z.string().trim().min(1),
  /** Shapes which Bayesian model the analyst later uses. */
  outcomeType: z.enum(["binary", "continuous"]),
  /** Named confounders to watch for; empty when none surfaced. */
  confounders: z.array(z.string().trim().min(1)).default([]),
  /**
   * Which way the user expects the outcome to move. The verdict badge compares
   * it against the measured sign to say Confirmed or Reversed — the app can
   * know a direction, never whether a direction is good news.
   *
   * Optional: hypotheses sharpened before this field existed carry none, and
   * their badge falls back to a plain direction word.
   */
  expectedDirection: z.enum(["up", "down"]).optional(),
  /**
   * Whose life this is about. Almost always the user; "other" covers a plant, a
   * pet, a room. Its only consequence is that a non-self result never becomes a
   * prior recalled into a hunch about the user's own body — otherwise "you
   * already learned music affects droopiness" turns up inside a sleep trial.
   */
  subject: z.enum(["self", "other"]).default("self"),
  /**
   * Extra things worth logging daily next to the outcome — context for reading
   * the result. Never verdicted. Empty when nothing obvious applies.
   */
  trackers: z.array(trackerSchema).max(4).default([]),
  /**
   * Can the person apply this change on any day they choose? "Skip coffee
   * after 2pm" — yes. "Play basketball" — no: it needs other people, a court,
   * and a body that feels like playing. A false here means the trial gets one
   * observation window and its arms come from what actually happened, because
   * scheduling a pickup game is asking the user to fake it.
   */
  schedulable: z.boolean().default(true),
  /**
   * The daily yes/no that says whether the change happened. Required when the
   * hunch is not schedulable — it is the arm assignment. Optional on a
   * schedulable one, where it is the adherence count and never touches an arm.
   */
  exposure: trackerSchema.optional(),
});

/**
 * The Coach's output before the cross-field rules. The input side of the
 * shape, because that is how Mastra types `response.object`: at runtime it has
 * been validated and its defaults filled, but the type leaves them optional.
 */
export type SharpenedHypothesisDraft = z.input<typeof sharpenedHypothesisObjectSchema>;

/** A sharpened hypothesis, with the rules that tie `schedulable` and `exposure` together. */
export const sharpenedHypothesisSchema = sharpenedHypothesisObjectSchema
  .refine((h) => h.schedulable || h.exposure !== undefined, {
    message: "A change that can't be scheduled needs a daily yes/no to tell its days apart.",
    path: ["exposure"],
  })
  .refine((h) => h.exposure === undefined || h.exposure.type === "binary", {
    message: "An exposure is a yes/no — did it happen today?",
    path: ["exposure", "type"],
  });

export type SharpenedHypothesis = z.infer<typeof sharpenedHypothesisSchema>;
