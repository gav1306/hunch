import { describe, expect, it } from "vitest";
import { priorsBlock, selectCandidatePriors, toPriors } from "@/lib/memory/priors";
import { priorSchema } from "@/lib/schemas/prior";
import type { CausalEdge } from "@/generated/prisma/client";

const edge = (over: Partial<CausalEdge>): CausalEdge => ({
  id: "e", userId: "u", cause: "", effect: "", direction: "increases",
  effectSize: 1, confidence: 0.9, sourceHunchId: "h", kind: "causal", createdAt: new Date(),
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

describe("toPriors and the edge's kind", () => {
  it("carries a correlational edge's kind through", () => {
    const corr = { ...caffeine, kind: "correlational" };
    expect(toPriors([corr], ["h_caf"])[0].kind).toBe("correlational");
  });
});

describe("priorSchema", () => {
  it("reads a prior written before kind existed as causal", () => {
    const old = {
      cause: "c", effect: "e", direction: "increases",
      effectSize: 1, confidence: 0.9, sourceHunchId: "h",
    };
    expect(priorSchema.parse(old).kind).toBe("causal");
  });
});

describe("priorsBlock", () => {
  const lead = { tested: "TESTED:", untested: "UNTESTED:" };
  const tested = {
    cause: "Coffee after 2pm hurts sleep", effect: "sleep", direction: "decreases" as const,
    effectSize: -1, confidence: 0.82, sourceHunchId: "h1", kind: "causal" as const,
  };
  const seen = {
    ...tested, cause: "Late screens hurt sleep", confidence: 0.71, sourceHunchId: "h2",
    kind: "correlational" as const,
  };

  it("is empty with no priors", () => {
    expect(priorsBlock([], lead)).toBe("");
  });

  it("lists each kind under its own lead", () => {
    expect(priorsBlock([tested, seen], lead)).toBe(
      "\n\nTESTED:\n- Coffee after 2pm hurts sleep (decreases, 82% confident)" +
        "\n\nUNTESTED:\n- Late screens hurt sleep (decreases, 71% confident)",
    );
  });

  it("omits a lead with nothing under it", () => {
    expect(priorsBlock([seen], lead).startsWith("\n\nUNTESTED:")).toBe(true);
    expect(priorsBlock([tested], lead)).not.toContain("UNTESTED");
  });
});
