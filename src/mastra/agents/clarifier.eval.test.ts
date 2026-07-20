import { describe, expect, test } from "vitest";
import { askClarifying } from "@/mastra/agents/clarifier";
import { clarifyingQuestionsSchema } from "@/lib/schemas/clarify";

const hasKey = Boolean(process.env.AWS_PROFILE || process.env.AWS_ACCESS_KEY_ID);

describe.skipIf(!hasKey)("Clarifier quality", () => {
  test("asks <=3 valid, on-topic questions for a vague hunch", async () => {
    const out = await askClarifying("coffee wrecks my sleep");
    expect(clarifyingQuestionsSchema.safeParse(out).success).toBe(true);
    expect(out.questions.length).toBeGreaterThanOrEqual(1);
    expect(out.questions.length).toBeLessThanOrEqual(3);
    for (const q of out.questions) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(4);
    }
  }, 60_000);
});
