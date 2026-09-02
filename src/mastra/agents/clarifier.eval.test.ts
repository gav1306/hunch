import { describe, expect, test } from "vitest";
import { askClarifying } from "@/mastra/agents/clarifier";
import { clarifyingQuestionsSchema } from "@/lib/schemas/clarify";

const hasKey = Boolean(process.env.OPENROUTER_API_KEY);

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

  test("asks which one when the hunch is about several of something", async () => {
    const { questions } = await askClarifying("my houseplants droop when I play music");
    const text = JSON.stringify(questions).toLowerCase();
    // Averaging several plants is not a measurement of any of them.
    expect(text).toMatch(/which|one of them|each plant|a single/);
  }, 60_000);

  test("offers a no-device option when the honest measure needs an instrument", async () => {
    const { questions } = await askClarifying("my blood sugar spikes when I eat white rice");
    const text = JSON.stringify(questions).toLowerCase();
    // Either they own a monitor, or they log what they can actually feel.
    expect(text).toMatch(/monitor|meter|cuff|device/);
    expect(text).toMatch(/energy|tired|sleepy|feel|sluggish|crash/);
  }, 60_000);
});
