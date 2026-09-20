import { describe, expect, it } from "vitest";
import { exportFilename, toCsv, toText, type ExportHunch } from "./export";

const hunch: ExportHunch = {
  statement: "Coffee after 2pm reduces my sleep quality.",
  outcomeMetric: "sleep quality",
  rawText: "does coffee wreck my sleep",
  startedAt: new Date("2026-08-01T00:00:00.000Z"),
  shape: "phased",
  exposureId: null,
  parameters: [
    { id: "p1", label: "sleep quality", unit: "1-10", isPrimary: true },
    { id: "p2", label: "caffeine, mg", unit: null },
  ],
  checkIns: [
    {
      loggedOn: new Date("2026-08-01T00:00:00.000Z"),
      phase: "A",
      values: [
        { parameterId: "p1", value: 6 },
        { parameterId: "p2", value: 0 },
      ],
    },
    {
      loggedOn: new Date("2026-08-02T00:00:00.000Z"),
      phase: "B",
      values: [{ parameterId: "p1", value: 4 }],
    },
  ],
  verdict: {
    category: "hurt",
    narrative: "Your sleep was worse on the days you had coffee.",
    pEffect: 0.94,
    effect: -1.8,
    ci: [-3.1, -0.4],
    nA: 7,
    nB: 7,
  },
};

/**
 * An observational trial: one 21-day window, arm derived each day from the
 * "played basketball" exposure rather than the stored phase. The stored
 * `phase` is deliberately wrong on two of these rows, to prove the export
 * ignores it in favor of the derived arm.
 */
const observationalHunch: ExportHunch = {
  ...hunch,
  shape: "observational",
  exposureId: "exp",
  parameters: [
    { id: "p1", label: "knee pain", unit: "1-10", isPrimary: true },
    { id: "exp", label: "played basketball", unit: null },
  ],
  checkIns: [
    {
      // Stored phase "B" but exposure says no basketball → arm A.
      loggedOn: new Date("2026-08-01T00:00:00.000Z"),
      phase: "B",
      values: [
        { parameterId: "p1", value: 6 },
        { parameterId: "exp", value: 0 },
      ],
    },
    {
      // Stored phase "A" but exposure says basketball happened → arm B.
      loggedOn: new Date("2026-08-02T00:00:00.000Z"),
      phase: "A",
      values: [
        { parameterId: "p1", value: 4 },
        { parameterId: "exp", value: 1 },
      ],
    },
    {
      // No exposure reading at all → no arm.
      loggedOn: new Date("2026-08-03T00:00:00.000Z"),
      phase: "A",
      values: [{ parameterId: "p1", value: 5 }],
    },
  ],
};

describe("toCsv", () => {
  it("puts one column per parameter and one row per day", () => {
    const lines = toCsv(hunch).trim().split("\n");
    expect(lines[0]).toBe("date,phase,sleep quality (1-10),\"caffeine, mg\"");
    expect(lines[1]).toBe("2026-08-01,A,6,0");
    expect(lines).toHaveLength(3);
  });

  it("leaves a cell empty when that parameter wasn't logged that day", () => {
    const lines = toCsv(hunch).trim().split("\n");
    expect(lines[2]).toBe("2026-08-02,B,4,");
  });

  it("quotes a label containing a comma so the columns don't shift", () => {
    expect(toCsv(hunch)).toContain('"caffeine, mg"');
  });

  it("handles a hunch with no check-ins at all", () => {
    const empty = { ...hunch, checkIns: [] };
    expect(toCsv(empty).trim().split("\n")).toHaveLength(1);
  });

  it("keeps the phased header word 'phase', not 'arm'", () => {
    const lines = toCsv(hunch).trim().split("\n");
    expect(lines[0].split(",")[1]).toBe("phase");
  });
});

describe("toCsv — observational", () => {
  it("writes the second column header as 'arm', not 'phase'", () => {
    const lines = toCsv(observationalHunch).trim().split("\n");
    expect(lines[0].split(",")[1]).toBe("arm");
  });

  it("derives the arm from the exposure reading, ignoring the stored phase", () => {
    const lines = toCsv(observationalHunch).trim().split("\n");
    // date,arm,knee pain (1-10),played basketball
    expect(lines[1]).toBe("2026-08-01,A,6,0");
    expect(lines[2]).toBe("2026-08-02,B,4,1");
  });

  it("writes an empty cell when the day has no exposure reading", () => {
    const lines = toCsv(observationalHunch).trim().split("\n");
    expect(lines[3]).toBe("2026-08-03,,5,");
  });

  it("falls back to the stored phase when shape is observational but exposureId is missing", () => {
    const noExposureId = { ...observationalHunch, exposureId: null };
    const lines = toCsv(noExposureId).trim().split("\n");
    expect(lines[1]).toBe("2026-08-01,B,6,0");
    expect(lines[2]).toBe("2026-08-02,A,4,1");
    expect(lines[3]).toBe("2026-08-03,A,5,");
  });
});

describe("toText", () => {
  it("leads with the hypothesis and the verdict", () => {
    const out = toText(hunch);
    expect(out).toContain("Coffee after 2pm reduces my sleep quality.");
    expect(out).toContain("Sleep quality went down");
    expect(out).toContain("94% sure");
    expect(out).toContain("Your sleep was worse");
  });

  it("lists every logged day", () => {
    const out = toText(hunch);
    expect(out).toContain("2026-08-01");
    expect(out).toContain("2026-08-02");
  });

  it("says so plainly when there is no verdict yet", () => {
    const out = toText({ ...hunch, verdict: null });
    expect(out).toMatch(/still running|no verdict/i);
  });

  it("labels a phased day line with 'phase', not 'arm'", () => {
    const out = toText(hunch);
    expect(out).toContain("phase A");
    expect(out).toContain("phase B");
  });
});

describe("toText — observational", () => {
  it("labels each day with the derived arm, not the stored phase", () => {
    const out = toText(observationalHunch);
    expect(out).toContain("2026-08-01  arm A");
    expect(out).toContain("2026-08-02  arm B");
  });

  it("says 'no arm (not answered)' for a day with no exposure reading", () => {
    const out = toText(observationalHunch);
    expect(out).toContain("2026-08-03  no arm (not answered)");
  });
});

describe("exportFilename", () => {
  it("slugs the statement and keeps the extension", () => {
    expect(exportFilename(hunch, "csv")).toBe("coffee-after-2pm-reduces-my-sleep-quality.csv");
  });

  it("falls back to a generic name when the statement slugs to nothing", () => {
    expect(exportFilename({ ...hunch, statement: "!!!" }, "txt")).toBe("hunch.txt");
  });
});
