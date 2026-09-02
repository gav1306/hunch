import { z } from "zod";

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
  id: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  answer: z.string().trim().min(1),
});
export type ClarifyingAnswer = z.infer<typeof clarifyingAnswerSchema>;

/** Body of POST /api/hunch — raw hunch plus any clarifying answers. */
export const sharpenRequestSchema = z.object({
  rawText: z.string().trim().min(1, "A hunch can't be empty."),
  answers: z.array(clarifyingAnswerSchema).default([]),
  /**
   * The user read the medication refusal and chose to keep this as a log
   * instead. Skipping the check is safe here precisely because the diary path
   * cannot schedule a medication change: its single phase says change nothing.
   */
  observeOnly: z.boolean().default(false),
});
export type SharpenRequest = z.infer<typeof sharpenRequestSchema>;
