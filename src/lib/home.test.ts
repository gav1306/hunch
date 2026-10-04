import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { hunch: { findMany: vi.fn() } } }));
vi.mock("@/lib/zone", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/zone")>()),
  userTimeZone: vi.fn(async () => "UTC"),
}));

import { getHomeData } from "@/lib/home";
import { db } from "@/lib/db";
import { userTimeZone } from "@/lib/zone";

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
  type: "amount",
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

describe("getHomeData archived hunches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps an archived row out of every working group, only in archived", async () => {
    // A concluded hunch with a verdict would otherwise land in `verdicts`, so
    // this fails if the `live` filter in getHomeData is ever removed.
    vi.mocked(db.hunch.findMany).mockResolvedValue([
      hunch({
        verdict: { category: "helped", effect: 1.2, pEffect: 0.97 },
        archivedAt: utcMidnight(-1),
      }),
    ] as never);
    const data = await getHomeData("u1");
    expect(data.archived).toHaveLength(1);
    expect(data.today).toHaveLength(0);
    expect(data.running).toHaveLength(0);
    expect(data.needsSetup).toHaveLength(0);
    expect(data.verdicts).toHaveLength(0);
  });

  it("keeps hasAny true when every row is archived", async () => {
    // hasAny gates the first-run empty state — if it went false here, the
    // archived section would never render for a user to reach.
    vi.mocked(db.hunch.findMany).mockResolvedValue([
      hunch({ archivedAt: utcMidnight(-1) }),
    ] as never);
    const data = await getHomeData("u1");
    expect(data.hasAny).toBe(true);
    expect(data.archived).toHaveLength(1);
  });
});

describe("getHomeData on the user's own day", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // 20:00 PDT on 22 Sep — already 23 Sep in UTC.
    vi.setSystemTime(new Date("2026-09-23T03:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("counts days and looks up today's log by the user's date", async () => {
    vi.mocked(userTimeZone).mockResolvedValue("America/Los_Angeles");
    vi.mocked(db.hunch.findMany).mockResolvedValue([
      hunch({
        status: "running",
        protocol: {
          design,
          safetyState: "approved",
          startedAt: new Date("2026-09-20T00:00:00.000Z"),
        },
        // Filed under 22 Sep: the user's today, though UTC is already on the 23rd.
        checkIns: [{ loggedOn: new Date("2026-09-22T00:00:00.000Z") }],
      }),
    ] as never);

    const data = await getHomeData("u1");

    // 20, 21, 22 Sep: day 3 in Los Angeles (UTC would say day 4).
    expect(data.running[0].progress).toEqual({ day: 3, total: 10 });
    expect(data.running[0].loggedToday).toBe(true);
    expect(data.today).toHaveLength(0);
  });
});

describe("getHomeData day track", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gives every day of a running trial its phase and state", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([
      hunch({
        status: "running",
        protocol: { design, safetyState: "approved", startedAt: utcMidnight(-3) },
        // Days 1 and 3 logged, day 2 missed, day 4 is today.
        checkIns: [{ loggedOn: utcMidnight(-3) }, { loggedOn: utcMidnight(-1) }],
      }),
    ] as never);

    const [h] = (await getHomeData("u1")).today;

    expect(h.track).toHaveLength(10);
    expect(h.track!.map((d) => d.state)).toEqual([
      "logged", "missed", "logged", "today",
      "future", "future", "future", "future", "future", "future",
    ]);
    expect(h.track!.map((d) => d.kind)).toEqual([
      ...Array(5).fill("baseline"),
      ...Array(5).fill("intervention"),
    ]);
  });

  it("does not count yesterday's log as today's", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([
      hunch({
        status: "running",
        protocol: { design, safetyState: "approved", startedAt: utcMidnight(-3) },
        checkIns: [{ loggedOn: utcMidnight(-1) }],
      }),
    ] as never);
    const [h] = (await getHomeData("u1")).today;
    expect(h.loggedToday).toBe(false);
  });

  it("has no track before the trial's first day", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([
      hunch({
        status: "running",
        protocol: { design, safetyState: "approved", startedAt: utcMidnight(1) },
      }),
    ] as never);
    expect((await getHomeData("u1")).running[0].track).toBe(null);
  });

  it("has no track for a hunch that was never started", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([hunch()] as never);
    expect((await only()).track).toBe(null);
  });
});
