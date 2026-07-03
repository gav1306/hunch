import { describe, expect, it } from "vitest";
import { priorSchema, recallResultSchema } from "@/lib/schemas/prior";

describe("prior schemas", () => {
  it("validates a recalled prior DTO", () => {
    const dto = {
      cause: "Cutting afternoon caffeine increases nightly sleep duration.",
      effect: "hours of sleep from a tracker",
      direction: "increases",
      effectSize: 2.03,
      confidence: 0.97,
      sourceHunchId: "h_abc",
    };
    expect(priorSchema.safeParse(dto).success).toBe(true);
  });
  it("rejects an unknown direction", () => {
    const dto = {
      cause: "x", effect: "y", direction: "maybe",
      effectSize: 1, confidence: 0.5, sourceHunchId: "h1",
    };
    expect(priorSchema.safeParse(dto).success).toBe(false);
  });
  it("accepts a recall result with selected ids", () => {
    expect(
      recallResultSchema.safeParse({ relatedSourceHunchIds: ["h1", "h2"] }).success,
    ).toBe(true);
    expect(
      recallResultSchema.safeParse({ relatedSourceHunchIds: [] }).success,
    ).toBe(true);
  });
});
