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
});
