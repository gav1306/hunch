import { describe, expect, test } from "vitest";
import { flagReading, typoFlag } from "@/lib/safety/reading-flags";

const bounded = { label: "Systolic", type: "amount" as const, unit: "mmHg", min: 60, max: 200 };
const bugs = { label: "Bugs found", type: "count" as const, unit: null, min: null, max: null };

/** n readings that sit tightly around `mean`, so a real outlier stands out. */
const steady = (n: number, mean: number) =>
  Array.from({ length: n }, (_, i) => mean + (i % 2 === 0 ? 1 : -1));

describe("typoFlag", () => {
  // Not part of flagReading: a slipped digit lands outside the parameter's own
  // bounds, so validation already refuses the reading. This enriches that
  // refusal rather than accepting a value that would corrupt the trial.
  test("catches a slipped digit and names the number without it", () => {
    expect(typoFlag(bounded, 1200)?.suggestion).toBe(120);
  });

  test("says nothing about a merely wrong value", () => {
    // 250 is out of range but no digit was slipped; refusing to guess beats
    // inventing a correction.
    expect(typoFlag(bounded, 250)).toBeNull();
  });

  test("says nothing about a value inside the range", () => {
    expect(typoFlag(bounded, 118)).toBeNull();
  });

  test("needs bounds to know a digit slipped", () => {
    expect(typoFlag(bugs, 9000)).toBeNull();
  });
});

describe("published limits", () => {
  test("flags a systolic reading at or above the crisis threshold", () => {
    const flag = flagReading({ parameter: bounded, value: 185, history: [] });
    expect(flag?.kind).toBe("limit");
    expect(flag?.source).toBeTruthy();
    expect(flag?.message).toContain("180");
  });

  test("flags a very low systolic reading too", () => {
    expect(flagReading({ parameter: bounded, value: 85, history: [] })?.kind).toBe("limit");
  });

  test("flags diastolic on its own threshold", () => {
    const dia = { ...bounded, label: "Diastolic", min: 30, max: 150 };
    expect(flagReading({ parameter: dia, value: 125, history: [] })?.kind).toBe("limit");
    expect(flagReading({ parameter: dia, value: 95, history: [] })).toBeNull();
  });

  test("flags glucose on its own thresholds", () => {
    const glu = { label: "Peak glucose", type: "amount" as const, unit: "mg/dL", min: 40, max: 400 };
    expect(flagReading({ parameter: glu, value: 320, history: [] })?.kind).toBe("limit");
    expect(flagReading({ parameter: glu, value: 62, history: [] })?.kind).toBe("limit");
    expect(flagReading({ parameter: glu, value: 140, history: [] })).toBeNull();
  });

  test("never applies a medical limit to something that isn't medical", () => {
    // A bug count of 9000 is not a medical event.
    expect(flagReading({ parameter: bugs, value: 9000, history: steady(10, 3) })?.kind).not.toBe(
      "limit",
    );
  });

  test("a slipped digit never reaches a limit flag — validation refuses it first", () => {
    // 1200 -> 120 is a keystroke, and telling someone to see a doctor about a
    // keystroke would be both wrong and alarming. The route answers 400 with
    // the suggestion; flagReading is only ever asked about accepted readings.
    expect(typoFlag(bounded, 1200)).not.toBeNull();
  });
});

describe("personal outlier", () => {
  test("flags a reading far outside this person's own spread", () => {
    const flag = flagReading({ parameter: bugs, value: 40, history: steady(10, 3) });
    expect(flag?.kind).toBe("outlier");
    expect(flag?.message.toLowerCase()).toContain("unusual for you");
    expect(flag?.message).toContain("3");
  });

  test("says nothing until there is enough history to have a spread", () => {
    expect(flagReading({ parameter: bugs, value: 40, history: [3, 4] })).toBeNull();
  });

  test("says nothing about a reading that fits the spread", () => {
    expect(flagReading({ parameter: bugs, value: 4, history: steady(10, 3) })).toBeNull();
  });

  test("makes no claim beyond the user's own data", () => {
    const flag = flagReading({ parameter: bugs, value: 40, history: steady(10, 3) });
    expect(flag?.message.toLowerCase()).not.toMatch(/doctor|dangerous|worry|normal range/);
  });
});
