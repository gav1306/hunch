import { describe, expect, it } from "vitest";
import { classifyVerdict } from "@/lib/verdict";
import type { Belief } from "@/lib/schemas/belief";
import type { PhaseStatus } from "@/lib/schedule";

const done: PhaseStatus = {
  phase: null, kind: null, phaseIndex: null, dayInPhase: 0, washout: false, done: true, started: true,
};
const running: PhaseStatus = { ...done, done: false };

const belief = (over: Partial<Belief>): Belief => ({
  pEffect: 0.5, effect: 0, ci: [-1, 1], nA: 5, nB: 5,
  model: "normal-normal", state: "live", ...over,
});

describe("classifyVerdict", () => {
  it("returns null while the trial is still running", () => {
    expect(classifyVerdict(belief({}), running)).toBe(null);
  });
  it("returns null when there is no schedule (never started)", () => {
    expect(classifyVerdict(belief({}), null)).toBe(null);
  });
  it("is insufficient when an arm has fewer than 3 check-ins", () => {
    expect(classifyVerdict(belief({ nA: 2, nB: 5 }), done)).toBe("inconclusive_insufficient");
    expect(classifyVerdict(belief({ nA: 5, nB: 1 }), done)).toBe("inconclusive_insufficient");
  });
  it("is helped when the CI is entirely above zero", () => {
    expect(classifyVerdict(belief({ effect: 1.2, ci: [0.4, 2.0] }), done)).toBe("helped");
  });
  it("is hurt when the CI is entirely below zero", () => {
    expect(classifyVerdict(belief({ effect: -1.2, ci: [-2.0, -0.4] }), done)).toBe("hurt");
  });
  it("is no-effect when the CI straddles zero", () => {
    expect(classifyVerdict(belief({ effect: 0.1, ci: [-0.5, 0.7] }), done)).toBe("inconclusive_no_effect");
  });
  it("treats a CI bound touching zero as straddling (not clear)", () => {
    expect(classifyVerdict(belief({ effect: 0.5, ci: [0, 1.0] }), done)).toBe("inconclusive_no_effect");
    expect(classifyVerdict(belief({ effect: -0.5, ci: [-1.0, 0] }), done)).toBe("inconclusive_no_effect");
  });
});
