import { describe, expect, it } from "vitest";
import {
  classifyVerdict,
  exposureDropped,
  exposureSummary,
  observationalCaveat,
  verdictBadge,
  verdictHeadline,
} from "@/lib/verdict";
import type { Belief } from "@/lib/schemas/belief";
import type { ExposureReport } from "@/lib/schemas/verdict";
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

  const observationalReport: ExposureReport = {
    label: "Played basketball",
    exposed: 6,
    unexposed: 12,
    unknown: 3,
    observational: true,
  };
  const phasedReport: ExposureReport = {
    label: "Played basketball",
    exposed: 6,
    unexposed: 12,
    unknown: 3,
    observational: false,
  };

  it("names the split instead of the days on an observational trial's thin arm", () => {
    expect(verdictHeadline("inconclusive_insufficient", outcome, observationalReport)).toBe(
      `Too few days either side of "Played basketball"`,
    );
  });

  it("falls back to the generic headline on a phased trial — missing days really are missing", () => {
    expect(verdictHeadline("inconclusive_insufficient", outcome, phasedReport)).toBe(
      "Not enough days to tell",
    );
  });

  it("ignores the third argument on every other category", () => {
    expect(verdictHeadline("helped", outcome, observationalReport)).toBe(
      "Bugs found today went up",
    );
    expect(verdictHeadline("hurt", outcome, observationalReport)).toBe(
      "Bugs found today went down",
    );
    expect(verdictHeadline("inconclusive_no_effect", outcome, observationalReport)).toBe(
      "No difference in bugs found today",
    );
  });
});

describe("exposureSummary", () => {
  it("names the label and reports exposed days over every logged day", () => {
    const e: ExposureReport = {
      label: "Played basketball",
      exposed: 6,
      unexposed: 12,
      unknown: 3,
      observational: true,
    };
    expect(exposureSummary(e)).toBe("Played basketball on 6 of 21 logged days.");
  });

  it("counts intervention days on a phased trial, where only phase-B days are counted", () => {
    // The report's denominator on a phased trial is the phase-B days alone, so
    // "logged days" would undercount every baseline day the user logged.
    const e: ExposureReport = {
      label: "Took magnesium",
      exposed: 5,
      unexposed: 1,
      unknown: 1,
      observational: false,
    };
    expect(exposureSummary(e)).toBe("Took magnesium on 5 of 7 intervention days.");
  });

  it("says nothing while no day has been counted yet", () => {
    // A phased trial spends its whole first baseline here: "on 0 of 0" is noise.
    const zero = { label: "Took magnesium", exposed: 0, unexposed: 0, unknown: 0 };
    expect(exposureSummary({ ...zero, observational: false })).toBe(null);
    expect(exposureSummary({ ...zero, observational: true })).toBe(null);
  });
});

describe("exposureDropped", () => {
  const base = { label: "Played basketball", exposed: 10, unexposed: 10, observational: true };

  it("returns null when nothing was dropped", () => {
    expect(exposureDropped({ ...base, unknown: 0 })).toBe(null);
  });

  it("uses singular phrasing for exactly one dropped day", () => {
    expect(exposureDropped({ ...base, unknown: 1 })).toBe(
      "1 day had no answer either way, so it isn't in the comparison.",
    );
  });

  it("uses plural phrasing for more than one dropped day", () => {
    expect(exposureDropped({ ...base, unknown: 3 })).toBe(
      "3 days had no answer either way, so they aren't in the comparison.",
    );
  });
});

describe("observationalCaveat", () => {
  it("names the label and says correlation, not causation, in the user's own words", () => {
    const e: ExposureReport = {
      label: "Played basketball",
      exposed: 6,
      unexposed: 12,
      unknown: 3,
      observational: true,
    };
    const caveat = observationalCaveat(e);
    expect(caveat).toContain("played basketball");
    expect(caveat).toContain("what went together, not what caused what");
  });
});

describe("verdictBadge", () => {
  it("says Confirmed when the effect went the way the user expected", () => {
    expect(verdictBadge("helped", "up")).toBe("Confirmed");
    expect(verdictBadge("hurt", "down")).toBe("Confirmed");
  });

  it("says Reversed when it went the other way", () => {
    expect(verdictBadge("helped", "down")).toBe("Reversed");
    expect(verdictBadge("hurt", "up")).toBe("Reversed");
  });

  it("keeps Reversed distinct from Not confirmed", () => {
    // Folding them together would throw away the most interesting result an
    // experiment can produce.
    expect(verdictBadge("inconclusive_no_effect", "up")).toBe("Not confirmed");
    expect(verdictBadge("helped", "down")).not.toBe("Not confirmed");
  });

  it("names the days when there weren't enough", () => {
    expect(verdictBadge("inconclusive_insufficient", "up")).toBe("Not enough days");
    expect(verdictBadge("inconclusive_insufficient", null)).toBe("Not enough days");
  });

  it("falls back to a direction word when no prediction was recorded", () => {
    expect(verdictBadge("helped", null)).toBe("Increase");
    expect(verdictBadge("hurt", undefined)).toBe("Decrease");
    expect(verdictBadge("inconclusive_no_effect", null)).toBe("No difference");
  });

  it("never uses valence words", () => {
    const banned = /helped|hurt|better|worse|improved|good|bad/i;
    for (const c of ["helped", "hurt", "inconclusive_no_effect"] as const) {
      for (const d of ["up", "down", null] as const) {
        expect(verdictBadge(c, d)).not.toMatch(banned);
      }
    }
  });
});
