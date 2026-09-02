import { describe, expect, it } from "vitest";
import { exportFilename, toCsv, toText, type ExportHunch } from "./export";

const hunch: ExportHunch = {
  statement: "Coffee after 2pm reduces my sleep quality.",
  outcomeMetric: "sleep quality",
  rawText: "does coffee wreck my sleep",
  startedAt: new Date("2026-08-01T00:00:00.000Z"),
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
});

describe("exportFilename", () => {
  it("slugs the statement and keeps the extension", () => {
    expect(exportFilename(hunch, "csv")).toBe("coffee-after-2pm-reduces-my-sleep-quality.csv");
  });

  it("falls back to a generic name when the statement slugs to nothing", () => {
    expect(exportFilename({ ...hunch, statement: "!!!" }, "txt")).toBe("hunch.txt");
  });
});
