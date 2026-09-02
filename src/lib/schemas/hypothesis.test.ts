import { describe, expect, test } from "vitest";
import {
  hunchInputSchema,
  sharpenedHypothesisSchema,
} from "@/lib/schemas/hypothesis";

describe("hunchInputSchema", () => {
  test("accepts non-empty raw text", () => {
    const r = hunchInputSchema.safeParse({ rawText: "coffee makes me anxious" });
    expect(r.success).toBe(true);
  });

  test("rejects empty raw text", () => {
    const r = hunchInputSchema.safeParse({ rawText: "   " });
    expect(r.success).toBe(false);
  });
});

describe("sharpenedHypothesisSchema", () => {
  const valid = {
    statement: "Drinking coffee after 2pm reduces my sleep quality.",
    outcomeMetric: "Subjective sleep quality, 1-10 self-report",
    outcomeType: "continuous" as const,
    confounders: ["stress", "screen time"],
  };

  test("accepts a well-formed hypothesis", () => {
    expect(sharpenedHypothesisSchema.safeParse(valid).success).toBe(true);
  });

  test("rejects an invalid outcomeType", () => {
    const r = sharpenedHypothesisSchema.safeParse({
      ...valid,
      outcomeType: "ordinal",
    });
    expect(r.success).toBe(false);
  });

  test("rejects an empty statement", () => {
    const r = sharpenedHypothesisSchema.safeParse({ ...valid, statement: "" });
    expect(r.success).toBe(false);
  });

  test("defaults confounders to an empty array when omitted", () => {
    const noConf = {
      statement: valid.statement,
      outcomeMetric: valid.outcomeMetric,
      outcomeType: valid.outcomeType,
    };
    const r = sharpenedHypothesisSchema.safeParse(noConf);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.confounders).toEqual([]);
  });

  test("defaults trackers to an empty array when omitted", () => {
    const r = sharpenedHypothesisSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.trackers).toEqual([]);
  });

  test("accepts up to four proposed trackers", () => {
    const trackers = Array.from({ length: 4 }, (_, i) => ({
      label: `tracker ${i}`,
      type: "binary" as const,
    }));
    expect(sharpenedHypothesisSchema.safeParse({ ...valid, trackers }).success).toBe(true);
  });

  test("rejects more than four proposed trackers", () => {
    const trackers = Array.from({ length: 5 }, (_, i) => ({
      label: `tracker ${i}`,
      type: "binary" as const,
    }));
    expect(sharpenedHypothesisSchema.safeParse({ ...valid, trackers }).success).toBe(false);
  });
});

describe("expectedDirection", () => {
  const base = {
    statement: "Skipping my morning walk makes my code buggier.",
    outcomeMetric: "bugs found in review",
    outcomeType: "continuous" as const,
  };

  test("accepts up and down", () => {
    expect(sharpenedHypothesisSchema.safeParse({ ...base, expectedDirection: "up" }).success).toBe(
      true,
    );
    expect(
      sharpenedHypothesisSchema.safeParse({ ...base, expectedDirection: "down" }).success,
    ).toBe(true);
  });

  test("rejects anything that isn't a direction", () => {
    expect(
      sharpenedHypothesisSchema.safeParse({ ...base, expectedDirection: "sideways" }).success,
    ).toBe(false);
  });

  test("is optional, so hypotheses sharpened before the field still parse", () => {
    expect(sharpenedHypothesisSchema.safeParse(base).success).toBe(true);
  });
});
