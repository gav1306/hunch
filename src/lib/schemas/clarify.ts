import { z } from "zod";

/**
 * Longest hunch accepted. A hunch is a sentence or two; the cap stops a pasted
 * essay (or a script) from being sent to the model and stored.
 */
export const MAX_HUNCH_CHARS = 1000;
/** Longest typed answer to a clarifying question. */
export const MAX_ANSWER_CHARS = 500;

/** The hunch's text, wherever a route accepts it. */
export const hunchTextSchema = z
  .string()
  .trim()
  .min(1, "A hunch can't be empty.")
  .max(MAX_HUNCH_CHARS, `Keep a hunch shorter than ${MAX_HUNCH_CHARS} characters.`);

/**
 * The Clarifier's output. One hunch-specific question: a prompt, 2-4 tappable
 * options, and whether a free-text "other" answer is allowed. `id` is a stable
 * slug (e.g. "outcome") used to key answers.
 */
export const clarifyingQuestionSchema = z.object({
  id: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  options: z.array(z.string().trim().min(1)).min(2).max(4),
  allowOther: z.boolean(),
});
export type ClarifyingQuestion = z.infer<typeof clarifyingQuestionSchema>;

/** At most three questions — never overwhelm the user. */
export const clarifyingQuestionsSchema = z.object({
  questions: z.array(clarifyingQuestionSchema).min(1).max(3),
});
export type ClarifyingQuestions = z.infer<typeof clarifyingQuestionsSchema>;

/**
 * A resolved answer fed back to the coach. Carries the prompt text (not just the
 * id) so the coach has full context for an accurate hypothesis.
 */
export const clarifyingAnswerSchema = z.object({
  id: z.string().trim().min(1).max(64),
  prompt: z.string().trim().min(1).max(MAX_ANSWER_CHARS),
  answer: z.string().trim().min(1).max(MAX_ANSWER_CHARS, "Keep an answer shorter than that."),
});
export type ClarifyingAnswer = z.infer<typeof clarifyingAnswerSchema>;

/** Body of POST /api/hunch — raw hunch plus any clarifying answers. */
export const sharpenRequestSchema = z.object({
  rawText: hunchTextSchema,
  answers: z.array(clarifyingAnswerSchema).max(10).default([]),
  /**
   * The user read the medication refusal and chose to keep this as a log
   * instead. Skipping the check is safe here precisely because the diary path
   * cannot schedule a medication change: its single phase says change nothing.
   */
  observeOnly: z.boolean().default(false),
  /**
   * The prior ids clarify's recall already picked for this same text. Left
   * unset (not defaulted to []) when clarify didn't run, so recall still does.
   */
  priorIds: z.array(z.string()).max(20).optional(),
  /**
   * Minted per draft by the form (`src/lib/draft-key.ts`). A second request
   * with the same key gets the hunch the first one saved instead of a copy.
   */
  clientKey: z.uuid().optional(),
});
export type SharpenRequest = z.infer<typeof sharpenRequestSchema>;
