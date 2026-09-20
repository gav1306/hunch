import { describe, expect, it } from "vitest";
import {
  clarifyingQuestionsSchema,
  clarifyingAnswerSchema,
  sharpenRequestSchema,
} from "./clarify";

describe("clarify schemas", () => {
  it("accepts 1-3 questions with 2-4 options each", () => {
    const ok = clarifyingQuestionsSchema.safeParse({
      questions: [
        { id: "outcome", prompt: "How do you notice bad sleep?", options: ["falling asleep", "waking up"], allowOther: true },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("rejects more than 3 questions", () => {
    const q = { id: "x", prompt: "p", options: ["a", "b"], allowOther: false };
    const bad = clarifyingQuestionsSchema.safeParse({ questions: [q, q, q, q] });
    expect(bad.success).toBe(false);
  });

  it("rejects a question with fewer than 2 options", () => {
    const bad = clarifyingQuestionsSchema.safeParse({
      questions: [{ id: "x", prompt: "p", options: ["only"], allowOther: false }],
    });
    expect(bad.success).toBe(false);
  });

  it("answer carries id, prompt, and answer text", () => {
    const ok = clarifyingAnswerSchema.safeParse({ id: "outcome", prompt: "How?", answer: "waking up" });
    expect(ok.success).toBe(true);
  });

  it("sharpenRequest defaults answers to an empty array", () => {
    const parsed = sharpenRequestSchema.parse({ rawText: "coffee wrecks sleep" });
    expect(parsed.answers).toEqual([]);
  });

  it("sharpenRequest leaves priorIds unset when clarify didn't recall", () => {
    // Unset means "recall hasn't run for this text"; [] means it ran and found
    // nothing. Defaulting to [] would silently skip recall on the fallback path.
    const parsed = sharpenRequestSchema.parse({ rawText: "coffee wrecks sleep" });
    expect(parsed.priorIds).toBeUndefined();
  });

  it("sharpenRequest carries the prior ids clarify recalled", () => {
    const parsed = sharpenRequestSchema.parse({ rawText: "coffee wrecks sleep", priorIds: ["h_caf"] });
    expect(parsed.priorIds).toEqual(["h_caf"]);
  });
});
