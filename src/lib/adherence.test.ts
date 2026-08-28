import { describe, expect, it } from "vitest";
import { adherenceStrip, adherenceSummary } from "@/lib/adherence";
import type { ProtocolDesign } from "@/lib/schemas/protocol";

/** A 2-day baseline, one rest day, a 2-day intervention. */
const DESIGN: ProtocolDesign = {
  phases: [
    { label: "A", kind: "baseline", days: 2, name: "Baseline", action: "Log as usual." },
    { label: "B", kind: "intervention", days: 2, name: "On", action: "Take the thing." },
  ],
  washoutDays: 1,
  controls: [],
  instructions: "test",
};

const START = new Date("2026-08-01T00:00:00Z");
const day = (n: number) => new Date(Date.UTC(2026, 7, 1 + n));

describe("adherenceStrip", () => {
  it("marks a logged day, a missed day and a rest day for what they are", () => {
    const strip = adherenceStrip({
      startedAt: START,
      design: DESIGN,
      loggedOn: [day(0)], // day 1 logged, day 2 not
      today: day(2), // the washout day
    });

    expect(strip.map((d) => d.state)).toEqual([
      "logged",
      "missed",
      "rest",
      "future",
      "future",
    ]);
  });

  it("never calls today missed — the day isn't over", () => {
    const strip = adherenceStrip({
      startedAt: START,
      design: DESIGN,
      loggedOn: [],
      today: day(0),
    });
    expect(strip[0].state).toBe("today");
  });

  it("marks today logged once it is", () => {
    const strip = adherenceStrip({
      startedAt: START,
      design: DESIGN,
      loggedOn: [day(0)],
      today: day(0),
    });
    expect(strip[0].state).toBe("logged");
  });

  it("carries the phase each day belongs to, and repeats a label by index", () => {
    const aba: ProtocolDesign = {
      ...DESIGN,
      phases: [
        { label: "A", kind: "baseline", days: 1, name: "Baseline", action: "x" },
        { label: "B", kind: "intervention", days: 1, name: "On", action: "y" },
        { label: "A", kind: "baseline", days: 1, name: "Return", action: "z" },
      ],
      washoutDays: 0,
    };
    const strip = adherenceStrip({
      startedAt: START,
      design: aba,
      loggedOn: [],
      today: day(2),
    });
    expect(strip.map((d) => d.phaseIndex)).toEqual([0, 1, 2]);
    expect(strip.map((d) => d.kind)).toEqual([
      "baseline",
      "intervention",
      "baseline",
    ]);
  });

  it("counts every day of the trial, however far past the end today is", () => {
    const strip = adherenceStrip({
      startedAt: START,
      design: DESIGN,
      loggedOn: [],
      today: day(40),
    });
    expect(strip).toHaveLength(5);
    expect(strip.at(-1)!.state).toBe("missed");
  });

  it("has nothing to show before day 1 arrives", () => {
    const strip = adherenceStrip({
      startedAt: day(3),
      design: DESIGN,
      loggedOn: [],
      today: day(0),
    });
    expect(strip.every((d) => d.state === "future")).toBe(true);
  });
});

describe("adherenceSummary", () => {
  it("counts logged against the loggable days that have passed", () => {
    const strip = adherenceStrip({
      startedAt: START,
      design: DESIGN,
      loggedOn: [day(0)],
      today: day(3),
    });
    // Days 1-2 loggable and past, day 3 rest, day 4 is today.
    expect(adherenceSummary(strip)).toEqual({ logged: 1, missed: 1, elapsed: 2 });
  });

  it("reports nothing missed on a trial that hasn't reached day 1", () => {
    const strip = adherenceStrip({
      startedAt: day(3),
      design: DESIGN,
      loggedOn: [],
      today: day(0),
    });
    expect(adherenceSummary(strip)).toEqual({ logged: 0, missed: 0, elapsed: 0 });
  });
});
