import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    hunch: { findFirst: vi.fn(), update: vi.fn() },
    verdict: { findUnique: vi.fn(), create: vi.fn() },
    causalEdge: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
// The Analyst is a live model call; this suite never reaches it, and must not
// import it for real.
vi.mock("@/mastra/workflows/analysis", () => ({ runAnalysis: vi.fn() }));
// The real engine, watched: the fresh path's arms are only observable as what
// the route hands to it.
vi.mock("@/lib/bayes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bayes")>();
  return { ...actual, computeBelief: vi.fn(actual.computeBelief) };
});

import { GET } from "./route";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { runAnalysis } from "@/mastra/workflows/analysis";
import { computeBelief } from "@/lib/bayes";

const params = { params: Promise.resolve({ id: "h1" }) };
const request = () => new Request("http://localhost/api/hunch/h1/verdict");

const diary = {
  id: "h1",
  userId: "u1",
  hypothesis: { statement: "I feel tired some days.", outcomeMetric: "tiredness 1-5", outcomeType: "continuous" },
  protocol: {
    startedAt: new Date("2026-08-01T00:00:00.000Z"),
    safetyState: "observe-only",
    design: {
      phases: [{ label: "A", kind: "baseline", days: 21, name: "Baseline", action: "Log it each day." }],
      washoutDays: 0,
      controls: [],
      instructions: "Log it each day.",
      shape: "diary",
    },
  },
  verdict: null,
  parameters: [],
  checkIns: [],
};

// A concluded observational hunch: a stored verdict, a valid design, and an
// exposure parameter with a known mix of exposed/unexposed/unknown days —
// exercises the stored-verdict early return, which now sits *below* the
// design parse.
const storedVerdictRow = {
  category: "helped",
  narrative: "Playing basketball lifted your mood.",
  pEffect: 0.9,
  effect: 1.5,
  ciLow: 0.5,
  ciHigh: 2.5,
  nA: 5,
  nB: 5,
  model: "normal-normal",
};

const concludedObservational = {
  id: "h1",
  userId: "u1",
  hypothesis: { statement: "Playing basketball lifts my mood.", outcomeMetric: "evening mood", outcomeType: "continuous" },
  protocol: {
    startedAt: new Date("2026-08-01T00:00:00.000Z"),
    safetyState: "approved",
    design: {
      phases: [{ label: "A", kind: "baseline", days: 21, name: "Just live normally", action: "Log it each day." }],
      washoutDays: 0,
      controls: [],
      instructions: "Log it each day.",
      shape: "observational",
    },
  },
  verdict: storedVerdictRow,
  parameters: [
    { id: "primary", label: "Evening mood", isPrimary: true, isExposure: false },
    { id: "exp", label: "Played basketball", isPrimary: false, isExposure: true },
  ],
  checkIns: [
    { phase: "A", values: [{ parameterId: "primary", value: 8 }, { parameterId: "exp", value: 1 }] },
    { phase: "A", values: [{ parameterId: "primary", value: 7 }, { parameterId: "exp", value: 1 }] },
    { phase: "A", values: [{ parameterId: "primary", value: 8 }, { parameterId: "exp", value: 1 }] },
    { phase: "A", values: [{ parameterId: "primary", value: 4 }, { parameterId: "exp", value: 0 }] },
    { phase: "A", values: [{ parameterId: "primary", value: 5 }, { parameterId: "exp", value: 0 }] },
    { phase: "A", values: [{ parameterId: "primary", value: 6 }] }, // unknown: no exposure reading
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ user: { id: "u1" } } as never);
  vi.mocked(db.hunch.findFirst).mockResolvedValue(diary as never);
});

describe("GET /api/hunch/[id]/verdict", () => {
  it("refuses to compute a verdict for a diary", async () => {
    const res = await GET(request(), params);

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: "This one is a log, not a trial — there's nothing to compare it against.",
    });
    // Nothing is asked of the Analyst and nothing is written: a single arm has
    // no contrast, and a verdict computed from one would be invented.
    expect(runAnalysis).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("still refuses before the trial has started", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...diary,
      protocol: { ...diary.protocol, startedAt: null },
    } as never);
    const res = await GET(request(), params);
    expect(res.status).toBe(409);
  });

  it("401s without a session", async () => {
    vi.mocked(getSession).mockResolvedValue(null as never);
    expect((await GET(request(), params)).status).toBe(401);
  });

  it("404s a hunch that isn't theirs", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(null as never);
    expect((await GET(request(), params)).status).toBe(404);
  });

  it("returns 200 with the stored verdict and its exposure counts, not a throw or a 409", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(concludedObservational as never);

    const res = await GET(request(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verdict).toMatchObject({
      category: "helped",
      narrative: "Playing basketball lifted your mood.",
    });
    // Not merely "the key is present" — the actual counts, computed fresh from
    // the check-ins above (3 exposed, 2 unexposed, 1 with no exposure reading).
    expect(body.verdict.exposure).toEqual({
      label: "Played basketball",
      exposed: 3,
      unexposed: 2,
      unknown: 1,
      observational: true,
    });
    // The stored path never touches the engine or the Analyst.
    expect(runAnalysis).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("stored verdict, no exposure parameter: exposure is null, not a throw", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...concludedObservational,
      parameters: [{ id: "primary", label: "Evening mood", isPrimary: true, isExposure: false }],
    } as never);

    const res = await GET(request(), params);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verdict.exposure).toBeNull();
  });

  it("fresh path, observational: splits the arms by the yes/no, never by the stored phase", async () => {
    // Every stored `CheckIn.phase` is "A" — the calendar's label for a
    // one-window design. If the route fell back to phased wiring, every day
    // would land in one arm and the verdict could never be reached.
    const days: [mood: number, played: number | null][] = [
      [8, 1], [7, 1], [8, 1], [9, 1], [4, 0], [5, 0], [4, 0], [6, null],
    ];
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...concludedObservational,
      verdict: null,
      checkIns: days.map(([mood, played]) => ({
        phase: "A",
        values: [
          { parameterId: "primary", value: mood },
          ...(played === null ? [] : [{ parameterId: "exp", value: played }]),
        ],
      })),
    } as never);
    vi.mocked(runAnalysis).mockImplementation(async ({ category, belief }) => ({
      category,
      narrative: "Mood was higher on the days you played.",
      pEffect: belief.pEffect,
      effect: belief.effect,
      ci: belief.ci,
      nA: belief.nA,
      nB: belief.nB,
      model: belief.model,
    }));
    vi.mocked(db.$transaction).mockResolvedValue([] as never);

    const res = await GET(request(), params);

    expect(res.status).toBe(200);
    expect(computeBelief).toHaveBeenCalledTimes(1);
    // Yes-days are arm B, no-days arm A; the unanswered day is in neither.
    expect(vi.mocked(computeBelief).mock.calls[0][0]).toEqual([
      { phase: "B", value: 8 },
      { phase: "B", value: 7 },
      { phase: "B", value: 8 },
      { phase: "B", value: 9 },
      { phase: "A", value: 4 },
      { phase: "A", value: 5 },
      { phase: "A", value: 4 },
    ]);
    // The Analyst is told what it is narrating: a comparison of yes-days and
    // no-days on the user's own question, not an intervention.
    expect(runAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ observational: true, exposureLabel: "Played basketball" }),
    );
  });
});
