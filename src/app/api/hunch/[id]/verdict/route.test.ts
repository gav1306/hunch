import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { hunch: { findFirst: vi.fn() }, verdict: { findUnique: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
// The Analyst is a live model call; this suite never reaches it, and must not
// import it for real.
vi.mock("@/mastra/workflows/analysis", () => ({ runAnalysis: vi.fn() }));

import { GET } from "./route";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { runAnalysis } from "@/mastra/workflows/analysis";

const params = { params: Promise.resolve({ id: "h1" }) };
const request = () => new Request("http://localhost/api/hunch/h1/verdict");

const diary = {
  id: "h1",
  userId: "u1",
  hypothesis: { statement: "I feel tired some days.", outcomeMetric: "tiredness 1-5", outcomeType: "continuous" },
  protocol: { startedAt: new Date("2026-08-01T00:00:00.000Z"), safetyState: "observe-only", design: {} },
  verdict: null,
  parameters: [],
  checkIns: [],
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
});
