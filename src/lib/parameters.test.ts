import { describe, expect, test } from "vitest";
import {
  activeParameters,
  armRows,
  backfillKind,
  draftsFromSharpened,
  engineOutcomeType,
  exposureReport,
  isExposedReading,
  pickExposure,
  pickPrimary,
  toParameterDto,
} from "@/lib/parameters";
import { parameterSchema } from "@/lib/schemas/parameter";

describe("draftsFromSharpened", () => {
  test("makes the outcome metric the primary, first in order", () => {
    const rows = draftsFromSharpened({
      outcomeMetric: "hours of sleep from a tracker",
      outcomeType: "continuous",
      trackers: [{ label: "caffeine after 2pm", type: "binary" }],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      label: "hours of sleep from a tracker",
      type: "amount",
      isPrimary: true,
    });
    expect(rows[1]).toMatchObject({ label: "caffeine after 2pm", isPrimary: false });
  });

  test("works with no trackers at all", () => {
    const rows = draftsFromSharpened({ outcomeMetric: "mood", outcomeType: "binary" });
    expect(rows).toHaveLength(1);
    expect(rows[0].isPrimary).toBe(true);
  });

  test("drops trackers beyond the fourth", () => {
    const trackers = Array.from({ length: 6 }, (_, i) => ({
      label: `t${i}`,
      type: "binary" as const,
    }));
    const rows = draftsFromSharpened({ outcomeMetric: "m", outcomeType: "binary", trackers });
    expect(rows).toHaveLength(5);
  });

  test("never lets a tracker duplicate the primary label", () => {
    const rows = draftsFromSharpened({
      outcomeMetric: "hours of sleep",
      outcomeType: "continuous",
      trackers: [{ label: "hours of sleep", type: "amount" }],
    });
    expect(rows).toHaveLength(1);
  });

  test("carries unit and bounds through", () => {
    const rows = draftsFromSharpened({
      outcomeMetric: "m",
      outcomeType: "binary",
      trackers: [{ label: "stress", type: "amount", unit: "1-10", min: 1, max: 10 }],
    });
    expect(rows[1]).toMatchObject({ unit: "1-10", min: 1, max: 10 });
  });

  test("with no exposure, output is unchanged from today", () => {
    const rows = draftsFromSharpened({
      outcomeMetric: "hours of sleep",
      outcomeType: "continuous",
      trackers: [{ label: "caffeine after 2pm", type: "binary" }],
    });
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => "isExposure" in r && r.isExposure)).toBe(false);
  });

  test("with an exposure, the second row is the exposure and the primary is still first", () => {
    const rows = draftsFromSharpened({
      outcomeMetric: "hours of sleep",
      outcomeType: "continuous",
      trackers: [{ label: "stress", type: "amount" }],
      exposure: { label: "played basketball today", type: "binary" },
    });
    expect(rows[0]).toMatchObject({ label: "hours of sleep", isPrimary: true });
    expect(rows[1]).toMatchObject({
      label: "played basketball today",
      type: "binary",
      isPrimary: false,
      isExposure: true,
    });
  });

  test("drops an exposure whose label matches the primary's", () => {
    const rows = draftsFromSharpened({
      outcomeMetric: "hours of sleep",
      outcomeType: "continuous",
      exposure: { label: "hours of sleep", type: "binary" },
    });
    expect(rows).toHaveLength(1);
    expect(rows.some((r) => r.isExposure)).toBe(false);
  });

  test("drops a tracker whose label matches the exposure's", () => {
    const rows = draftsFromSharpened({
      outcomeMetric: "hours of sleep",
      outcomeType: "continuous",
      trackers: [{ label: "played basketball today", type: "binary" }],
      exposure: { label: "played basketball today", type: "binary" },
    });
    // Primary + the exposure row only — the duplicate tracker is dropped.
    expect(rows).toHaveLength(2);
    const matches = rows.filter((r) => r.label === "played basketball today");
    expect(matches).toHaveLength(1);
    expect(matches[0].isExposure).toBe(true);
  });

  test("with an exposure, trackers are capped at three so the total stays inside five", () => {
    const trackers = Array.from({ length: 6 }, (_, i) => ({
      label: `t${i}`,
      type: "binary" as const,
    }));
    const rows = draftsFromSharpened({
      outcomeMetric: "m",
      outcomeType: "binary",
      trackers,
      exposure: { label: "exposure", type: "binary" },
    });
    // primary + exposure + 3 trackers = 5
    expect(rows).toHaveLength(5);
    expect(rows.filter((r) => r.isExposure)).toHaveLength(1);
    expect(rows.filter((r) => !r.isPrimary && !r.isExposure)).toHaveLength(3);
  });
});

describe("toParameterDto", () => {
  const row = {
    id: "p1",
    label: "stress",
    type: "amount",
    unit: null,
    min: null,
    max: null,
    isPrimary: true,
    isExposure: false,
    sortOrder: 0,
    retiredAt: null,
  };

  test("turns Prisma nulls into undefined so the zod DTO accepts it", () => {
    const dto = toParameterDto(row);
    expect(dto.unit).toBeUndefined();
    expect(dto.min).toBeUndefined();
    expect(dto.max).toBeUndefined();
    expect(parameterSchema.safeParse(dto).success).toBe(true);
  });

  test("keeps real values", () => {
    const dto = toParameterDto({ ...row, unit: "1-10", min: 1, max: 10 });
    expect(dto).toMatchObject({ unit: "1-10", min: 1, max: 10 });
  });
});

describe("pickPrimary", () => {
  test("returns the primary row", () => {
    const rows = [
      { id: "a", isPrimary: false },
      { id: "b", isPrimary: true },
    ];
    expect(pickPrimary(rows)?.id).toBe("b");
  });

  test("returns null when there is none", () => {
    expect(pickPrimary([{ id: "a", isPrimary: false }])).toBeNull();
  });
});

describe("pickExposure", () => {
  test("returns the exposure row", () => {
    const rows = [
      { id: "a", isExposure: false },
      { id: "b", isExposure: true },
    ];
    expect(pickExposure(rows)?.id).toBe("b");
  });

  test("returns null when there is none", () => {
    expect(pickExposure([{ id: "a", isExposure: false }])).toBeNull();
  });
});

describe("isExposedReading", () => {
  test("1 is exposed", () => {
    expect(isExposedReading(1)).toBe(true);
  });

  test("0, null, undefined and other numbers are not exposed", () => {
    expect(isExposedReading(0)).toBe(false);
    expect(isExposedReading(null)).toBe(false);
    expect(isExposedReading(undefined)).toBe(false);
    expect(isExposedReading(2)).toBe(false);
    expect(isExposedReading(0.5)).toBe(false);
  });
});

describe("armRows", () => {
  const checkIns = [
    { phase: "A", values: [{ parameterId: "p1", value: 7 }, { parameterId: "p2", value: 1 }] },
    { phase: "B", values: [{ parameterId: "p2", value: 0 }] },
    { phase: "B", values: [{ parameterId: "p1", value: 5 }] },
  ];

  test("phased passthrough: one row per day carrying a primary reading, phase as stored", () => {
    expect(armRows(checkIns, "p1", { shape: "phased" })).toEqual([
      { phase: "A", value: 7 },
      { phase: "B", value: 5 },
    ]);
  });

  test("phased with a reporting-only exposureId still sorts by the stored phase", () => {
    expect(armRows(checkIns, "p1", { shape: "phased", exposureId: "some-id" })).toEqual([
      { phase: "A", value: 7 },
      { phase: "B", value: 5 },
    ]);
  });

  test("observational sorting: exposure 1 -> B, exposure 0 -> A, regardless of stored phase", () => {
    const rows = [
      { phase: "A", values: [{ parameterId: "primary", value: 7 }, { parameterId: "exp", value: 1 }] },
      { phase: "A", values: [{ parameterId: "primary", value: 3 }, { parameterId: "exp", value: 0 }] },
    ];
    expect(armRows(rows, "primary", { shape: "observational", exposureId: "exp" })).toEqual([
      { phase: "B", value: 7 },
      { phase: "A", value: 3 },
    ]);
  });

  test("stored phase ignored: an observational day stored as B with exposure 0 comes back as A", () => {
    const rows = [
      { phase: "B", values: [{ parameterId: "primary", value: 4 }, { parameterId: "exp", value: 0 }] },
    ];
    expect(armRows(rows, "primary", { shape: "observational", exposureId: "exp" })).toEqual([
      { phase: "A", value: 4 },
    ]);
  });

  test("unknown exposure dropped: a primary reading with no exposure reading produces no row", () => {
    const rows = [
      { phase: "A", values: [{ parameterId: "primary", value: 4 }] },
    ];
    expect(armRows(rows, "primary", { shape: "observational", exposureId: "exp" })).toEqual([]);
  });

  test("missing primary: a day with no primary reading produces no row, either shape", () => {
    const rows = [{ phase: "A", values: [{ parameterId: "exp", value: 1 }] }];
    expect(armRows(rows, "primary", { shape: "phased" })).toEqual([]);
    expect(armRows(rows, "primary", { shape: "observational", exposureId: "exp" })).toEqual([]);
  });

  test("no primaryId: returns []", () => {
    expect(armRows(checkIns, null, { shape: "phased" })).toEqual([]);
    expect(armRows(checkIns, undefined, { shape: "observational", exposureId: "p2" })).toEqual([]);
  });

  test("observational with no exposureId: returns [], not phase-sorted rows", () => {
    const rows = [
      { phase: "A", values: [{ parameterId: "primary", value: 7 }] },
      { phase: "B", values: [{ parameterId: "primary", value: 3 }] },
    ];
    expect(armRows(rows, "primary", { shape: "observational" })).toEqual([]);
    expect(armRows(rows, "primary", { shape: "observational", exposureId: null })).toEqual([]);
  });

  test("a corrected exposure moves the day: flipping exposure 1 -> 0 flips the arm B -> A", () => {
    const before = [
      { phase: "A", values: [{ parameterId: "primary", value: 4 }, { parameterId: "exp", value: 1 }] },
    ];
    const after = [
      { phase: "A", values: [{ parameterId: "primary", value: 4 }, { parameterId: "exp", value: 0 }] },
    ];
    expect(armRows(before, "primary", { shape: "observational", exposureId: "exp" })).toEqual([
      { phase: "B", value: 4 },
    ]);
    expect(armRows(after, "primary", { shape: "observational", exposureId: "exp" })).toEqual([
      { phase: "A", value: 4 },
    ]);
  });
});

describe("exposureReport", () => {
  const exposure = { id: "exp", label: "Played basketball" };

  test("null when there is no exposure — a hunch without one reports nothing", () => {
    const checkIns = [{ phase: "A", values: [{ parameterId: "exp", value: 1 }] }];
    expect(exposureReport(checkIns, null, "observational")).toBe(null);
    expect(exposureReport(checkIns, undefined, "observational")).toBe(null);
  });

  test("observational: counts over the whole window, unknown for logged days with no reading", () => {
    const checkIns = [
      ...Array.from({ length: 6 }, () => ({
        phase: "A",
        values: [{ parameterId: "exp", value: 1 }],
      })),
      ...Array.from({ length: 12 }, () => ({
        phase: "A",
        values: [{ parameterId: "exp", value: 0 }],
      })),
      ...Array.from({ length: 3 }, () => ({ phase: "A", values: [] })),
    ];
    expect(exposureReport(checkIns, exposure, "observational")).toEqual({
      label: "Played basketball",
      exposed: 6,
      unexposed: 12,
      unknown: 3,
      observational: true,
    });
  });

  test("phased: counts over phase-B days only — an A day with exposure 1 doesn't count", () => {
    const checkIns = [
      { phase: "A", values: [{ parameterId: "exp", value: 1 }] },
      { phase: "B", values: [{ parameterId: "exp", value: 1 }] },
      { phase: "B", values: [{ parameterId: "exp", value: 0 }] },
      { phase: "B", values: [] },
    ];
    expect(exposureReport(checkIns, exposure, "phased")).toEqual({
      label: "Played basketball",
      exposed: 1,
      unexposed: 1,
      unknown: 1,
      observational: false,
    });
  });

  test("diary: same rule as phased — no B days, so all zeroes", () => {
    const checkIns = [
      { phase: "A", values: [{ parameterId: "exp", value: 1 }] },
      { phase: "A", values: [{ parameterId: "exp", value: 0 }] },
    ];
    expect(exposureReport(checkIns, exposure, "diary")).toEqual({
      label: "Played basketball",
      exposed: 0,
      unexposed: 0,
      unknown: 0,
      observational: false,
    });
  });

  test("carries the label through verbatim", () => {
    const checkIns = [{ phase: "B", values: [{ parameterId: "exp", value: 1 }] }];
    expect(exposureReport(checkIns, { id: "exp", label: "Hours in the sun" }, "phased")?.label).toBe(
      "Hours in the sun",
    );
  });
});

describe("engineOutcomeType", () => {
  test("keeps binary binary", () => {
    expect(engineOutcomeType("binary")).toBe("binary");
  });

  test("sends every measured kind down the continuous path", () => {
    expect(engineOutcomeType("scale")).toBe("continuous");
    expect(engineOutcomeType("count")).toBe("continuous");
    expect(engineOutcomeType("amount")).toBe("continuous");
  });

  test("still understands rows written before the split", () => {
    expect(engineOutcomeType("continuous")).toBe("continuous");
  });

  test("falls back to continuous for an absent or unknown type", () => {
    // Erring towards continuous is the safe direction: treating a real number
    // as a coin flip would corrupt a verdict, while the reverse only widens an
    // interval.
    expect(engineOutcomeType(null)).toBe("continuous");
    expect(engineOutcomeType(undefined)).toBe("continuous");
    expect(engineOutcomeType("nonsense")).toBe("continuous");
  });
});

describe("backfillKind", () => {
  test("leaves binary alone", () => {
    expect(backfillKind({ type: "binary", unit: null, min: null, max: null })).toBe("binary");
  });

  test("reads a rating unit as a scale", () => {
    expect(backfillKind({ type: "continuous", unit: "1-10", min: 1, max: 10 })).toBe("scale");
    expect(backfillKind({ type: "continuous", unit: "1 - 5", min: null, max: null })).toBe("scale");
    expect(backfillKind({ type: "continuous", unit: "1–10", min: null, max: null })).toBe("scale");
  });

  test("treats a real unit as an amount, bounds or not", () => {
    expect(backfillKind({ type: "continuous", unit: "°F", min: 50, max: 90 })).toBe("amount");
    expect(backfillKind({ type: "continuous", unit: "hours", min: null, max: null })).toBe("amount");
  });

  test("defaults to amount, so an existing free-number row keeps its control", () => {
    // Guessing "count" here would swap a working number field for a stepper on
    // rows like "hours of sleep", which is a regression for people mid-trial.
    expect(backfillKind({ type: "continuous", unit: null, min: null, max: null })).toBe("amount");
  });
});

describe("activeParameters", () => {
  const rows = [
    { id: "p1", retiredAt: null },
    { id: "p2", retiredAt: new Date("2026-09-01T00:00:00.000Z") },
    { id: "p3", retiredAt: null },
  ];

  test("drops the retired ones and keeps order", () => {
    expect(activeParameters(rows).map((r) => r.id)).toEqual(["p1", "p3"]);
  });

  test("returns everything when nothing is retired", () => {
    expect(activeParameters([{ id: "p1", retiredAt: null }])).toHaveLength(1);
  });
});

describe("toParameterDto retirement", () => {
  const base = {
    id: "p1",
    label: "Stress",
    type: "scale",
    unit: "1-5",
    min: 1,
    max: 5,
    isPrimary: false,
    isExposure: false,
    sortOrder: 1,
  };

  test("reports a live parameter as not retired", () => {
    expect(toParameterDto({ ...base, retiredAt: null }).retired).toBe(false);
  });

  test("reports a retired parameter as retired", () => {
    expect(
      toParameterDto({ ...base, retiredAt: new Date("2026-09-01T00:00:00.000Z") }).retired,
    ).toBe(true);
  });

  test("sends a boolean, not a date — the client only asks whether", () => {
    expect(typeof toParameterDto({ ...base, retiredAt: new Date() }).retired).toBe("boolean");
  });
});
