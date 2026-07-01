import { describe, expect, it } from "vitest";
import { currentPhase } from "@/lib/schedule";
import type { ProtocolDesign } from "@/lib/schemas/protocol";

// ABA, 3 days per phase, 1 washout day between phases.
// Layout by day index from start:
//   0,1,2 = A | 3 = washout | 4,5,6 = B | 7 = washout | 8,9,10 = A | 11+ = done
const design: ProtocolDesign = {
  phases: [
    { label: "A", kind: "baseline", days: 3 },
    { label: "B", kind: "intervention", days: 3 },
    { label: "A", kind: "baseline", days: 3 },
  ],
  washoutDays: 1,
  controls: [],
  instructions: "x",
};

const start = new Date(Date.UTC(2026, 0, 1)); // Jan 1 2026 UTC
const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

describe("currentPhase", () => {
  it("reports not started before the start date", () => {
    const s = currentPhase(start, design, new Date(Date.UTC(2025, 11, 31)));
    expect(s.started).toBe(false);
    expect(s.phase).toBe(null);
  });
  it("is baseline A on day 0", () => {
    const s = currentPhase(start, design, day(0));
    expect(s.phase).toBe("A");
    expect(s.kind).toBe("baseline");
    expect(s.dayInPhase).toBe(0);
    expect(s.washout).toBe(false);
  });
  it("is the last day of A on day 2", () => {
    expect(currentPhase(start, design, day(2)).dayInPhase).toBe(2);
  });
  it("is a washout day on day 3", () => {
    const s = currentPhase(start, design, day(3));
    expect(s.washout).toBe(true);
    expect(s.phase).toBe(null);
  });
  it("is intervention B on day 4", () => {
    const s = currentPhase(start, design, day(4));
    expect(s.phase).toBe("B");
    expect(s.kind).toBe("intervention");
    expect(s.dayInPhase).toBe(0);
  });
  it("is the second washout on day 7", () => {
    expect(currentPhase(start, design, day(7)).washout).toBe(true);
  });
  it("is the returned baseline A on day 8", () => {
    const s = currentPhase(start, design, day(8));
    expect(s.phase).toBe("A");
    expect(s.dayInPhase).toBe(0);
  });
  it("is done after the last phase", () => {
    const s = currentPhase(start, design, day(11));
    expect(s.done).toBe(true);
    expect(s.phase).toBe(null);
  });
});

// washoutDays: 0 — phases abut with no rest day between them.
// Layout: 0,1,2 = A | 3,4,5 = B | 6,7,8 = A | 9+ = done
const noWashoutDesign: ProtocolDesign = {
  phases: [
    { label: "A", kind: "baseline", days: 3 },
    { label: "B", kind: "intervention", days: 3 },
    { label: "A", kind: "baseline", days: 3 },
  ],
  washoutDays: 0,
  controls: [],
  instructions: "x",
};

describe("currentPhase with no washout", () => {
  it("is the last day of A on day 2", () => {
    const s = currentPhase(start, noWashoutDesign, day(2));
    expect(s.phase).toBe("A");
    expect(s.dayInPhase).toBe(2);
    expect(s.washout).toBe(false);
  });
  it("moves straight into B on day 3 with no rest day", () => {
    const s = currentPhase(start, noWashoutDesign, day(3));
    expect(s.phase).toBe("B");
    expect(s.dayInPhase).toBe(0);
    expect(s.washout).toBe(false);
  });
  it("returns to A on day 6", () => {
    const s = currentPhase(start, noWashoutDesign, day(6));
    expect(s.phase).toBe("A");
    expect(s.dayInPhase).toBe(0);
  });
  it("is done on day 9", () => {
    const s = currentPhase(start, noWashoutDesign, day(9));
    expect(s.done).toBe(true);
    expect(s.phase).toBe(null);
  });
});
