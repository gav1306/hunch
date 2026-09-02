import { describe, expect, test } from "vitest";
import {
  checkInValuesInputSchema,
  parameterDraftSchema,
  parameterListSchema,
  parameterTypeSchema,
  trackerSchema,
  validateParameterValue,
} from "@/lib/schemas/parameter";

describe("trackerSchema", () => {
  test("accepts a bounded scale tracker", () => {
    const r = trackerSchema.safeParse({
      label: "stress",
      type: "scale",
      unit: "1-5",
      min: 1,
      max: 5,
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
  const primary = { label: "hours of sleep", type: "amount" as const, isPrimary: true };
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
    const r = parameterDraftSchema.safeParse({ label: "mood", type: "amount" });
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
  const scale = { label: "focus", type: "amount" as const, min: 1, max: 10 };

  test("accepts a value inside the bounds", () => {
    expect(validateParameterValue(scale, 7)).toBeNull();
  });

  test("rejects a value outside the bounds, naming the parameter", () => {
    const msg = validateParameterValue(scale, 42);
    expect(msg).not.toBeNull();
    expect(msg).toContain("focus");
  });

  test("accepts any finite number when unbounded", () => {
    expect(validateParameterValue({ label: "hrs", type: "amount" }, -3.5)).toBeNull();
  });

  test("rejects a non-finite number", () => {
    expect(validateParameterValue({ label: "hrs", type: "amount" }, Number.NaN)).not.toBeNull();
  });

  test("accepts only 0 or 1 for a binary parameter", () => {
    const binary = { label: "napped", type: "binary" as const };
    expect(validateParameterValue(binary, 1)).toBeNull();
    expect(validateParameterValue(binary, 0)).toBeNull();
    expect(validateParameterValue(binary, 0.5)).not.toBeNull();
  });
});

describe("parameterTypeSchema", () => {
  test("accepts the four measurement kinds", () => {
    for (const k of ["binary", "scale", "count", "amount"]) {
      expect(parameterTypeSchema.safeParse(k).success).toBe(true);
    }
  });

  test("no longer accepts the old continuous catch-all", () => {
    expect(parameterTypeSchema.safeParse("continuous").success).toBe(false);
  });
});

describe("validateParameterValue by kind", () => {
  test("holds a scale to 1-5 whatever bounds the row carries", () => {
    // A row migrated off the old free-number type can still carry min 1 max 10;
    // the kind's bounds have to win, or a 7 gets past a five-tap control.
    const p = { label: "Energy", type: "scale" as const, min: 1, max: 10 };
    expect(validateParameterValue(p, 3)).toBeNull();
    expect(validateParameterValue(p, 6)).toBe("Energy is a 1-5 rating.");
    expect(validateParameterValue(p, 0)).toBe("Energy is a 1-5 rating.");
    expect(validateParameterValue(p, 2.5)).toBe("Energy is a 1-5 rating.");
  });

  test("requires a whole number that is not negative for a count", () => {
    const p = { label: "Coffees", type: "count" as const };
    expect(validateParameterValue(p, 3)).toBeNull();
    expect(validateParameterValue(p, 0)).toBeNull();
    expect(validateParameterValue(p, 2.5)).toBe("Coffees is a whole number.");
    expect(validateParameterValue(p, -1)).toBe("Coffees can't be negative.");
  });

  test("keeps honouring an amount's own bounds", () => {
    const p = { label: "Sleep", type: "amount" as const, min: 0, max: 14 };
    expect(validateParameterValue(p, 7.5)).toBeNull();
    expect(validateParameterValue(p, 15)).toBe("Sleep can't be above 14.");
    expect(validateParameterValue(p, -1)).toBe("Sleep can't be below 0.");
  });

  test("still only takes 1 or 0 for a binary", () => {
    const p = { label: "Walked", type: "binary" as const };
    expect(validateParameterValue(p, 1)).toBeNull();
    expect(validateParameterValue(p, 2)).toBe("Walked is a yes/no — log 1 or 0.");
  });
});
