import { describe, expect, test } from "vitest";
import {
  checkInValuesInputSchema,
  parameterDraftSchema,
  parameterListSchema,
  trackerSchema,
  validateParameterValue,
} from "@/lib/schemas/parameter";

describe("trackerSchema", () => {
  test("accepts a bounded scale tracker", () => {
    const r = trackerSchema.safeParse({
      label: "stress",
      type: "continuous",
      unit: "1-10",
      min: 1,
      max: 10,
    });
    expect(r.success).toBe(true);
  });

  test("accepts a bare binary tracker", () => {
    const r = trackerSchema.safeParse({ label: "napped", type: "binary" });
    expect(r.success).toBe(true);
  });

  test("rejects an empty label", () => {
    expect(trackerSchema.safeParse({ label: "  ", type: "binary" }).success).toBe(false);
  });

  test("rejects an unknown type", () => {
    expect(trackerSchema.safeParse({ label: "mood", type: "ordinal" }).success).toBe(false);
  });
});

describe("parameterListSchema", () => {
  const primary = { label: "hours of sleep", type: "continuous" as const, isPrimary: true };
  const tracker = { label: "caffeine", type: "binary" as const, isPrimary: false };

  test("accepts one primary plus trackers", () => {
    expect(parameterListSchema.safeParse([primary, tracker]).success).toBe(true);
  });

  test("rejects an empty list", () => {
    expect(parameterListSchema.safeParse([]).success).toBe(false);
  });

  test("rejects two primaries", () => {
    const r = parameterListSchema.safeParse([primary, { ...tracker, isPrimary: true }]);
    expect(r.success).toBe(false);
  });

  test("rejects no primary", () => {
    expect(parameterListSchema.safeParse([tracker]).success).toBe(false);
  });

  test("rejects more than five parameters", () => {
    const many = [primary, ...Array.from({ length: 5 }, (_, i) => ({ ...tracker, label: `t${i}` }))];
    expect(parameterListSchema.safeParse(many).success).toBe(false);
  });

  test("rejects min >= max", () => {
    const r = parameterListSchema.safeParse([{ ...primary, min: 10, max: 1 }]);
    expect(r.success).toBe(false);
  });

  test("defaults isPrimary to false when omitted", () => {
    const r = parameterDraftSchema.safeParse({ label: "mood", type: "continuous" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isPrimary).toBe(false);
  });
});

describe("checkInValuesInputSchema", () => {
  test("accepts one or more readings", () => {
    const r = checkInValuesInputSchema.safeParse({
      values: [{ parameterId: "p1", value: 7 }],
    });
    expect(r.success).toBe(true);
  });

  test("rejects an empty payload", () => {
    expect(checkInValuesInputSchema.safeParse({ values: [] }).success).toBe(false);
  });

  test("rejects a non-numeric value", () => {
    const r = checkInValuesInputSchema.safeParse({
      values: [{ parameterId: "p1", value: "7" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("validateParameterValue", () => {
  const scale = { label: "focus", type: "continuous" as const, min: 1, max: 10 };

  test("accepts a value inside the bounds", () => {
    expect(validateParameterValue(scale, 7)).toBeNull();
  });

  test("rejects a value outside the bounds, naming the parameter", () => {
    const msg = validateParameterValue(scale, 42);
    expect(msg).not.toBeNull();
    expect(msg).toContain("focus");
  });

  test("accepts any finite number when unbounded", () => {
    expect(validateParameterValue({ label: "hrs", type: "continuous" }, -3.5)).toBeNull();
  });

  test("rejects a non-finite number", () => {
    expect(validateParameterValue({ label: "hrs", type: "continuous" }, Number.NaN)).not.toBeNull();
  });

  test("accepts only 0 or 1 for a binary parameter", () => {
    const binary = { label: "napped", type: "binary" as const };
    expect(validateParameterValue(binary, 1)).toBeNull();
    expect(validateParameterValue(binary, 0)).toBeNull();
    expect(validateParameterValue(binary, 0.5)).not.toBeNull();
  });
});
