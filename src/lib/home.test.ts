import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { hunch: { findMany: vi.fn() } } }));

import { getHomeData } from "@/lib/home";
import { db } from "@/lib/db";

const design = {
  phases: [
    { label: "A", kind: "baseline", days: 5, name: "Baseline", action: "Log as normal." },
    { label: "B", kind: "intervention", days: 5, name: "Change", action: "Apply it." },
  ],
  washoutDays: 0,
  controls: [],
  instructions: "Log once a day.",
};

const primary = {
  id: "p1",
  label: "hours of sleep",
  type: "continuous",
  min: null,
  max: null,
  isPrimary: true,
};

function hunch(over: Record<string, unknown> = {}) {
  return {
    id: "h1",
    rawText: "coffee wrecks my sleep",
    status: "sharpened",
    hypothesis: { statement: "Coffee after 2pm cuts my sleep.", outcomeType: "continuous" },
    protocol: null,
    verdict: null,
    parameters: [primary],
    checkIns: [],
    ...over,
  };
}

const utcMidnight = (offsetDays: number) => {
  const n = new Date();
  return new Date(
    Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) + offsetDays * 86_400_000,
  );
};

const only = async () => (await getHomeData("u1")).needsSetup[0];

describe("getHomeData setup stages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls an unsharpened hunch needs-sharpening", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([
      hunch({ status: "draft", hypothesis: null, parameters: [] }),
    ] as never);
    expect((await only()).setupStage).toBe("needs-sharpening");
  });

  it("calls a sharpened hunch with no protocol needs-plan", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([hunch()] as never);
    expect((await only()).setupStage).toBe("needs-plan");
  });

  it("calls a designed but unstarted hunch ready-to-start", async () => {
    // The state that only exists now that designing no longer starts the trial.
    vi.mocked(db.hunch.findMany).mockResolvedValue([
      hunch({ protocol: { design, safetyState: "approved", startedAt: null } }),
    ] as never);
    expect((await only()).setupStage).toBe("ready-to-start");
  });

  it("sends a plan that failed safety back to needs-plan, not ready-to-start", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([
      hunch({ protocol: { design, safetyState: "blocked", startedAt: null } }),
    ] as never);
    expect((await only()).setupStage).toBe("needs-plan");
  });

  it("leaves a running hunch out of setup entirely", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([
      hunch({ status: "running", protocol: { design, safetyState: "approved", startedAt: utcMidnight(0) } }),
    ] as never);
    const data = await getHomeData("u1");
    expect(data.needsSetup).toHaveLength(0);
    expect(data.today).toHaveLength(1);
    expect(data.today[0].setupStage).toBe(null);
  });
});

describe("getHomeData scheduled starts", () => {
  beforeEach(() => vi.clearAllMocks());

  const scheduled = () =>
    hunch({
      status: "running",
      protocol: { design, safetyState: "approved", startedAt: utcMidnight(1) },
    });

  it("reports no progress for a trial that starts tomorrow", async () => {
    // Reporting "day 1 of 10" would claim a day the user has not lived yet.
    vi.mocked(db.hunch.findMany).mockResolvedValue([scheduled()] as never);
    const [h] = (await getHomeData("u1")).running;
    expect(h.progress).toBe(null);
    expect(h.startsOn).toBe(utcMidnight(1).toISOString());
  });

  it("does not offer a scheduled trial for logging today", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([scheduled()] as never);
    const data = await getHomeData("u1");
    expect(data.today).toHaveLength(0);
    expect(data.running[0].loggableToday).toBe(false);
  });

  it("reports day 1 and no start date once the trial is under way", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([
      hunch({ status: "running", protocol: { design, safetyState: "approved", startedAt: utcMidnight(0) } }),
    ] as never);
    const [h] = (await getHomeData("u1")).today;
    expect(h.progress).toEqual({ day: 1, total: 10 });
    expect(h.startsOn).toBe(null);
    expect(h.loggableToday).toBe(true);
  });

  it("keeps counting for a trial started three days ago", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([
      hunch({ status: "running", protocol: { design, safetyState: "approved", startedAt: utcMidnight(-3) } }),
    ] as never);
    const [h] = (await getHomeData("u1")).today;
    expect(h.progress).toEqual({ day: 4, total: 10 });
  });
});
