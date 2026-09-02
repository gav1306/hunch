import { describe, expect, it } from "vitest";
import { classifyVerdict, verdictHeadline } from "@/lib/verdict";
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

describe("verdictHeadline", () => {
  const outcome = { label: "Bugs found today", unit: undefined };

  it("says the outcome went up when the effect is positive", () => {
    expect(verdictHeadline("helped", outcome)).toBe("Bugs found today went up");
  });
  it("says the outcome went down when the effect is negative", () => {
    expect(verdictHeadline("hurt", outcome)).toBe("Bugs found today went down");
  });
  it("names the outcome when there was no difference", () => {
    expect(verdictHeadline("inconclusive_no_effect", outcome)).toBe(
      "No difference in bugs found today",
    );
  });
  it("does not name the outcome when there wasn't enough data", () => {
    expect(verdictHeadline("inconclusive_insufficient", outcome)).toBe(
      "Not enough days to tell",
    );
  });

  it("capitalises a lower-case label so the headline reads as a sentence", () => {
    expect(verdictHeadline("helped", { label: "hours of sleep" })).toBe(
      "Hours of sleep went up",
    );
  });
  it("lower-cases the label mid-sentence", () => {
    expect(verdictHeadline("inconclusive_no_effect", { label: "Hours of sleep" })).toBe(
      "No difference in hours of sleep",
    );
  });
  it("leaves an acronym alone rather than mangling its case", () => {
    expect(verdictHeadline("helped", { label: "BP systolic" })).toBe("BP systolic went up");
    expect(verdictHeadline("inconclusive_no_effect", { label: "BP systolic" })).toBe(
      "No difference in BP systolic",
    );
  });

  it("falls back to a generic noun when no outcome label is known", () => {
    expect(verdictHeadline("helped", null)).toBe("Your outcome went up");
    expect(verdictHeadline("inconclusive_no_effect", null)).toBe("No difference either way");
  });

  it("never uses valence words, whichever way the effect went", () => {
    const banned = /helped|hurt|better|worse|improved|good|bad/i;
    for (const c of ["helped", "hurt", "inconclusive_no_effect"] as const) {
      expect(verdictHeadline(c, outcome)).not.toMatch(banned);
    }
  });
});
