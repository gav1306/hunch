import { describe, expect, test } from "vitest";
import {
  draftsFromSharpened,
  pickPrimary,
  primaryBeliefRows,
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
    sortOrder: 0,
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

describe("primaryBeliefRows", () => {
  const checkIns = [
    { phase: "A", values: [{ parameterId: "p1", value: 7 }, { parameterId: "p2", value: 1 }] },
    { phase: "B", values: [{ parameterId: "p2", value: 0 }] },
    { phase: "B", values: [{ parameterId: "p1", value: 5 }] },
  ];

  test("keeps only the primary parameter's readings, with their phase", () => {
    expect(primaryBeliefRows(checkIns, "p1")).toEqual([
      { phase: "A", value: 7 },
      { phase: "B", value: 5 },
    ]);
  });

  test("returns nothing when there is no primary", () => {
    expect(primaryBeliefRows(checkIns, null)).toEqual([]);
  });

  test("skips days where the primary was not logged", () => {
    expect(primaryBeliefRows([{ phase: "A", values: [] }], "p1")).toEqual([]);
  });
});
