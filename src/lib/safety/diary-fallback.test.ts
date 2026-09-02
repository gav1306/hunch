import { describe, expect, test } from "vitest";
import { diaryFallback } from "@/lib/safety/diary-fallback";
import { sharpenedHypothesisSchema } from "@/lib/schemas/hypothesis";

describe("diaryFallback", () => {
  test("produces something the hypothesis schema accepts", () => {
    expect(sharpenedHypothesisSchema.safeParse(diaryFallback("come off my statin")).success).toBe(
      true,
    );
  });

  test("keeps the user's own words as the statement, unedited", () => {
    // This path never claims to have sharpened anything, so it must not invent
    // a claim the person did not make.
    expect(diaryFallback("  do I feel less foggy off my statin  ").statement).toBe(
      "do I feel less foggy off my statin",
    );
  });

  test("gives something loggable every day without a device", () => {
    expect(diaryFallback("anything").outcomeMetric).toContain("1-5");
  });

  test("proposes no trackers and no confounders — it did no thinking", () => {
    const h = diaryFallback("anything");
    expect(h.trackers).toEqual([]);
    expect(h.confounders).toEqual([]);
  });
});
