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

describe("writeEdgeData and the subject", () => {
  it("writes no edge for a hunch about something that isn't the user", () => {
    // "You already learned music affects droopiness" must never surface inside
    // a sleep experiment.
    expect(writeEdgeData({ ...base, category: "helped", subject: "other" })).toBe(null);
  });

  it("still writes one for the user's own hunch", () => {
    expect(writeEdgeData({ ...base, category: "helped", subject: "self" })).not.toBe(null);
  });

  it("treats a missing subject as self, so hunches written before it keep working", () => {
    expect(writeEdgeData({ ...base, category: "helped" })).not.toBe(null);
  });
});
