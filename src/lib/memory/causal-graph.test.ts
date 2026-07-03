import { describe, expect, it } from "vitest";
import { writeEdgeData } from "@/lib/memory/causal-graph";

const base = {
  effect: 2.0,
  pEffect: 0.97,
  statement: "Cutting afternoon caffeine increases nightly sleep duration.",
  outcomeMetric: "hours of sleep from a tracker",
  hunchId: "h1",
  userId: "u1",
};

describe("writeEdgeData", () => {
  it("maps helped -> increases with the frozen numbers", () => {
    const edge = writeEdgeData({ ...base, category: "helped" });
    expect(edge).toEqual({
      userId: "u1",
      cause: base.statement,
      effect: base.outcomeMetric,
      direction: "increases",
      effectSize: 2.0,
      confidence: 0.97,
      sourceHunchId: "h1",
    });
  });
  it("maps hurt -> decreases", () => {
    expect(writeEdgeData({ ...base, category: "hurt" })?.direction).toBe("decreases");
  });
  it("maps inconclusive_no_effect -> none", () => {
    expect(
      writeEdgeData({ ...base, category: "inconclusive_no_effect" })?.direction,
    ).toBe("none");
  });
  it("writes no edge for inconclusive_insufficient", () => {
    expect(writeEdgeData({ ...base, category: "inconclusive_insufficient" })).toBe(null);
  });
});
