import { describe, expect, it } from "vitest";
import { selectCandidatePriors, toPriors } from "@/lib/memory/priors";
import type { CausalEdge } from "@/generated/prisma/client";

const edge = (over: Partial<CausalEdge>): CausalEdge => ({
  id: "e", userId: "u", cause: "", effect: "", direction: "increases",
  effectSize: 1, confidence: 0.9, sourceHunchId: "h", createdAt: new Date(),
  ...over,
});

const caffeine = edge({
  sourceHunchId: "h_caf",
  cause: "Cutting afternoon caffeine increases nightly sleep duration.",
  effect: "hours of sleep from a tracker",
});
const desk = edge({
  sourceHunchId: "h_desk",
  cause: "A standing desk improves afternoon focus.",
  effect: "focus rated 1-10",
});

describe("selectCandidatePriors", () => {
  it("surfaces an edge that shares keywords with the hunch", () => {
    const out = selectCandidatePriors([caffeine, desk], "does caffeine hurt my sleep?");
    expect(out.map((e) => e.sourceHunchId)).toEqual(["h_caf"]);
  });
  it("returns nothing when no keywords overlap", () => {
    expect(selectCandidatePriors([caffeine, desk], "did my running pace improve?")).toEqual([]);
  });
  it("ranks higher-overlap edges first and respects the limit", () => {
    const out = selectCandidatePriors([desk, caffeine], "caffeine and sleep hours", 1);
    expect(out).toHaveLength(1);
    expect(out[0].sourceHunchId).toBe("h_caf");
  });
  it("ignores stop-words so common words don't create false matches", () => {
    // "the" / "my" / "a" overlap but are stop-words -> no real match.
    expect(selectCandidatePriors([desk], "the a my of")).toEqual([]);
  });
  it("skips edges with no sourceHunchId", () => {
    const orphan = edge({ sourceHunchId: null, cause: "caffeine sleep", effect: "sleep" });
    expect(selectCandidatePriors([orphan], "caffeine sleep")).toEqual([]);
  });
});

describe("toPriors", () => {
  it("keeps only selected candidates and maps to the Prior DTO", () => {
    const priors = toPriors([caffeine, desk], ["h_caf"]);
    expect(priors).toHaveLength(1);
    expect(priors[0]).toMatchObject({
      cause: caffeine.cause,
      effect: caffeine.effect,
      direction: "increases",
      sourceHunchId: "h_caf",
    });
  });
  it("drops ids that were not in the candidate set (hallucinated)", () => {
    expect(toPriors([caffeine], ["h_ghost"])).toEqual([]);
  });
});
