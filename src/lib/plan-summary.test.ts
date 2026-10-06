import { describe, expect, it } from "vitest";
import { planSummary } from "@/lib/plan-summary";
import type { PhaseStatus } from "@/lib/schedule";
import type { ProtocolDesign } from "@/lib/schemas/protocol";

const design = {
  phases: [
    { label: "A", kind: "baseline", days: 7, name: "Usual evenings", action: "Eat as usual." },
    { label: "B", kind: "intervention", days: 14, name: "Walk after dinner", action: "Walk 15 minutes." },
  ],
  washoutDays: 1,
  controls: ["Dinner time", "Portion size"],
  instructions: "",
} as unknown as ProtocolDesign;

const status = (over: Partial<PhaseStatus>): PhaseStatus => ({
  phase: "B",
  kind: "intervention",
  phaseIndex: 1,
  dayInPhase: 3,
  washout: false,
  done: false,
  started: true,
  ...over,
});

describe("planSummary", () => {
  it("names the phase and counts the days left in it after today", () => {
    expect(planSummary(status({}), design)).toEqual({
      phase: "Walk after dinner",
      kind: "intervention",
      endsInDays: 10,
      controls: ["Dinner time", "Portion size"],
    });
  });

  it("says a phase ends today on its last day", () => {
    expect(planSummary(status({ dayInPhase: 13 }), design)?.endsInDays).toBe(0);
  });

  it("has nothing to summarise before the start, on a rest day, or once done", () => {
    expect(planSummary(status({ started: false, phaseIndex: null }), design)).toBe(null);
    expect(planSummary(status({ washout: true, phaseIndex: null }), design)).toBe(null);
    expect(planSummary(status({ done: true }), design)).toBe(null);
    expect(planSummary(null, design)).toBe(null);
  });
});
