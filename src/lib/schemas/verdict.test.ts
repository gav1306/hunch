import { describe, expect, it } from "vitest";
import {
  verdictCategorySchema,
  verdictNarrativeSchema,
  verdictSchema,
} from "@/lib/schemas/verdict";

describe("verdict schemas", () => {
  it("accepts the four categories and rejects others", () => {
    for (const c of ["helped", "hurt", "inconclusive_no_effect", "inconclusive_insufficient"]) {
      expect(verdictCategorySchema.safeParse(c).success).toBe(true);
    }
    expect(verdictCategorySchema.safeParse("maybe").success).toBe(false);
  });
  it("requires a non-empty narrative", () => {
    expect(verdictNarrativeSchema.safeParse({ narrative: "It helped." }).success).toBe(true);
    expect(verdictNarrativeSchema.safeParse({ narrative: "" }).success).toBe(false);
  });
  it("validates a full verdict DTO", () => {
    const dto = {
      category: "helped",
      narrative: "The intervention clearly improved your sleep.",
      pEffect: 0.97,
      effect: 1.2,
      ci: [0.4, 2.0],
      nA: 5,
      nB: 5,
      model: "normal-normal",
    };
    expect(verdictSchema.safeParse(dto).success).toBe(true);
  });
  it("rejects a pEffect outside 0..1", () => {
    const dto = {
      category: "helped", narrative: "x", pEffect: 1.4, effect: 1,
      ci: [0, 2], nA: 3, nB: 3, model: "beta-binomial",
    };
    expect(verdictSchema.safeParse(dto).success).toBe(false);
  });
  it("parses a verdict carrying an exposure report, and keeps it in the parsed value", () => {
    const exposure = {
      label: "Played basketball",
      exposed: 5,
      unexposed: 3,
      unknown: 1,
      observational: true,
    };
    const dto = {
      category: "helped",
      narrative: "The intervention clearly improved your sleep.",
      pEffect: 0.97,
      effect: 1.2,
      ci: [0.4, 2.0],
      nA: 5,
      nB: 5,
      model: "normal-normal",
      exposure,
    };
    const parsed = verdictSchema.safeParse(dto);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.exposure).toEqual(exposure);
    }
  });
  it("still parses a verdict frozen before exposure existed — no exposure field at all", () => {
    const dto = {
      category: "helped",
      narrative: "The intervention clearly improved your sleep.",
      pEffect: 0.97,
      effect: 1.2,
      ci: [0.4, 2.0],
      nA: 5,
      nB: 5,
      model: "normal-normal",
    };
    const parsed = verdictSchema.safeParse(dto);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.exposure).toBeUndefined();
    }
  });
});
