import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    verdict: { create: vi.fn(), findUnique: vi.fn() },
    hunch: { update: vi.fn() },
    causalEdge: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
// A live model call; this suite must never reach it.
vi.mock("@/mastra/workflows/analysis", () => ({ runAnalysis: vi.fn() }));

import { concludeTrial, type VerdictHunch } from "@/lib/conclude-trial";
import { db } from "@/lib/db";
import { runAnalysis } from "@/mastra/workflows/analysis";

// A 6-day phased trial, 3 days a side, well finished by `today`.
const design = {
  phases: [
    { label: "A", kind: "baseline", days: 3, name: "Baseline", action: "Log it each day." },
    { label: "B", kind: "intervention", days: 3, name: "Change", action: "Do the change." },
  ],
  washoutDays: 0,
  controls: [],
  instructions: "Log once a day.",
};
const startedAt = new Date("2026-09-01T00:00:00.000Z");
const today = new Date("2026-09-20T00:00:00.000Z");

const hunch = {
  id: "h1",
  hypothesis: {
    statement: "Magnesium before bed helps me sleep.",
    outcomeMetric: "hours of sleep",
    outcomeType: "continuous",
  },
  protocol: { startedAt, safetyState: "approved", design },
  verdict: null,
  parameters: [{ id: "primary", label: "Hours of sleep", isPrimary: true, isExposure: false }],
  checkIns: [
    { phase: "A", values: [{ parameterId: "primary", value: 6 }] },
    { phase: "A", values: [{ parameterId: "primary", value: 6.5 }] },
    { phase: "A", values: [{ parameterId: "primary", value: 6.2 }] },
    { phase: "B", values: [{ parameterId: "primary", value: 7.5 }] },
    { phase: "B", values: [{ parameterId: "primary", value: 8 }] },
    { phase: "B", values: [{ parameterId: "primary", value: 7.8 }] },
  ],
} as unknown as VerdictHunch;

beforeEach(() => vi.clearAllMocks());

describe("concludeTrial", () => {
  it("Analyst failure: 502, and nothing written", async () => {
    vi.mocked(runAnalysis).mockRejectedValue(new Error("model down"));

    const result = await concludeTrial(hunch, "u1", today);

    expect(result).toEqual({
      ok: false,
      status: 502,
      error: "Could not generate your verdict. Please try again.",
    });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.verdict.create).not.toHaveBeenCalled();
  });

  it("a concurrent write already froze the verdict: returns the stored row, no fresh narrative", async () => {
    vi.mocked(runAnalysis).mockResolvedValue({
      category: "helped",
      narrative: "Sleep rose after the change.",
      pEffect: 0.97,
      effect: 1.4,
      ci: [0.6, 2.2],
      nA: 3,
      nB: 3,
      model: "normal-normal",
    } as never);
    vi.mocked(db.$transaction).mockRejectedValue(new Error("unique constraint"));
    const existingRow = {
      category: "helped",
      narrative: "Stored by the other writer.",
      pEffect: 0.95,
      effect: 1.3,
      ciLow: 0.5,
      ciHigh: 2.1,
      nA: 3,
      nB: 3,
      model: "normal-normal",
    };
    vi.mocked(db.verdict.findUnique).mockResolvedValue(existingRow as never);

    const result = await concludeTrial(hunch, "u1", today);

    expect(result).toEqual({ ok: true, row: existingRow });
    expect(result).not.toHaveProperty("fresh");
  });
});
