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
 */
export const sharpenedHypothesisSchema = z.object({
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
   * Extra things worth logging daily next to the outcome — context for reading
   * the result. Never verdicted. Empty when nothing obvious applies.
   */
  trackers: z.array(trackerSchema).max(4).default([]),
});

export type SharpenedHypothesis = z.infer<typeof sharpenedHypothesisSchema>;
