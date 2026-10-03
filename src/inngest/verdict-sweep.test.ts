import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: { hunch: { findMany: vi.fn(), findUnique: vi.fn() }, user: { findMany: vi.fn() } },
}));
// Mocked whole: the real module imports the Analyst, which this suite must never load.
vi.mock("@/lib/conclude-trial", () => ({ concludeTrial: vi.fn(), VERDICT_INCLUDE: {} }));
vi.mock("@/inngest/client", () => ({ inngest: { createFunction: vi.fn(() => ({})) } }));

import { isDueForVerdict, runVerdictSweep, type SweepStep } from "@/inngest/verdict-sweep";
import { db } from "@/lib/db";
import { concludeTrial } from "@/lib/conclude-trial";

// A 10-day trial starting 10 Sep: days 10..19 Sep, `done` from 20 Sep.
const design = {
  phases: [
    { label: "A", kind: "baseline", days: 5, name: "Baseline", action: "Log it." },
    { label: "B", kind: "intervention", days: 5, name: "Change", action: "Do it." },
  ],
  washoutDays: 0,
  controls: [],
  instructions: "Log once a day.",
};
const startedAt = new Date("2026-09-10T00:00:00.000Z");
const at = (iso: string) => new Date(iso);

describe("isDueForVerdict", () => {
  it("is not due on the last scheduled day", () => {
    expect(isDueForVerdict(startedAt, design as never, "UTC", at("2026-09-19T12:00:00Z"))).toBe(false);
  });

  it("is not due on the grace day after the end", () => {
    expect(isDueForVerdict(startedAt, design as never, "UTC", at("2026-09-20T12:00:00Z"))).toBe(false);
  });

  it("is due once the grace day has passed", () => {
    expect(isDueForVerdict(startedAt, design as never, "UTC", at("2026-09-21T00:15:00Z"))).toBe(true);
  });

  it("waits for the grace day to pass in Los Angeles, not in UTC", () => {
    // 00:15Z on the 21st is 17:15 on the 20th in PDT — still the grace day there.
    expect(
      isDueForVerdict(startedAt, design as never, "America/Los_Angeles", at("2026-09-21T00:15:00Z")),
    ).toBe(false);
  });

  it("is due earlier in Kolkata, where the 21st has already begun", () => {
    // 20:00Z on the 20th is 01:30 on the 21st in IST.
    expect(isDueForVerdict(startedAt, design as never, "Asia/Kolkata", at("2026-09-20T20:00:00Z"))).toBe(true);
  });
});

/** Runs each step inline, like Inngest does on first execution. */
const step: SweepStep = { run: async (_id, fn) => fn() };

const candidate = (id: string) => ({
  id,
  userId: `u-${id}`,
  hypothesis: { outcomeMetric: "sleep" },
  protocol: { startedAt, design },
});
const zones = (...pairs: [string, string][]) =>
  vi.mocked(db.user.findMany).mockResolvedValue(
    pairs.map(([id, timeZone]) => ({ id, timeZone })) as never,
  );
const loaded = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  userId: `u-${id}`,
  status: "running",
  archivedAt: null,
  verdict: null,
  ...over,
});

describe("runVerdictSweep", () => {
  const now = at("2026-09-21T00:15:00Z");

  beforeEach(() => vi.clearAllMocks());

  it("concludes every due hunch and skips one still in its grace day", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([candidate("h1"), candidate("h2")] as never);
    zones(["u-h1", "UTC"], ["u-h2", "America/Los_Angeles"]);
    vi.mocked(db.hunch.findUnique).mockImplementation((async (args: { where: { id: string } }) =>
      loaded(args.where.id)) as never);
    vi.mocked(concludeTrial).mockResolvedValue({ ok: true, row: {} as never });

    expect(await runVerdictSweep(step, now)).toEqual({ due: 1, concluded: 1, failed: 0 });
    expect(concludeTrial).toHaveBeenCalledTimes(1);
    expect(vi.mocked(concludeTrial).mock.calls[0][1]).toBe("u-h1");
  });

  it("counts a failure and still concludes the next hunch", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([candidate("h1"), candidate("h2")] as never);
    zones(["u-h1", "UTC"], ["u-h2", "UTC"]);
    vi.mocked(db.hunch.findUnique).mockImplementation((async (args: { where: { id: string } }) =>
      loaded(args.where.id)) as never);
    vi.mocked(concludeTrial)
      .mockResolvedValueOnce({ ok: false, status: 502, error: "Analyst down" })
      .mockResolvedValueOnce({ ok: true, row: {} as never });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await runVerdictSweep(step, now)).toEqual({ due: 2, concluded: 1, failed: 1 });
    expect(errorSpy).toHaveBeenCalledWith("[verdict-sweep] conclude failed", "h1", expect.anything());

    errorSpy.mockRestore();
  });

  it("a malformed design can't stop the sweep for everyone else", async () => {
    const broken = { ...candidate("h1"), protocol: { startedAt, design: { phases: "garbage" } } };
    vi.mocked(db.hunch.findMany).mockResolvedValue([broken, candidate("h2")] as never);
    zones(["u-h1", "UTC"], ["u-h2", "UTC"]);
    vi.mocked(db.hunch.findUnique).mockImplementation((async (args: { where: { id: string } }) =>
      loaded(args.where.id)) as never);
    vi.mocked(concludeTrial).mockResolvedValue({ ok: true, row: {} as never });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await runVerdictSweep(step, now)).toEqual({ due: 1, concluded: 1, failed: 0 });
    expect(concludeTrial).toHaveBeenCalledTimes(1);
    expect(vi.mocked(concludeTrial).mock.calls[0][1]).toBe("u-h2");
    expect(errorSpy).toHaveBeenCalledWith("[verdict-sweep] skipping hunch", "h1", expect.anything());

    errorSpy.mockRestore();
  });

  it("a deterministic 409 is skipped, not counted as concluded or failed", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([candidate("h1")] as never);
    zones(["u-h1", "UTC"]);
    vi.mocked(db.hunch.findUnique).mockImplementation((async (args: { where: { id: string } }) =>
      loaded(args.where.id)) as never);
    vi.mocked(concludeTrial).mockResolvedValue({ ok: false, status: 409, error: "still running" });

    // The inline fake `step` never throws unless the function body throws, so
    // this also proves the step wasn't retried.
    expect(await runVerdictSweep(step, now)).toEqual({ due: 1, concluded: 0, failed: 0 });
  });

  it("skips a hunch that gained a verdict, or was archived, before its step ran", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([candidate("h1"), candidate("h2")] as never);
    zones(["u-h1", "UTC"], ["u-h2", "UTC"]);
    vi.mocked(db.hunch.findUnique)
      .mockResolvedValueOnce(loaded("h1", { verdict: { id: "v1" } }) as never)
      .mockResolvedValueOnce(loaded("h2", { archivedAt: new Date() }) as never);

    expect(await runVerdictSweep(step, now)).toEqual({ due: 2, concluded: 0, failed: 0 });
    expect(concludeTrial).not.toHaveBeenCalled();
  });

  it("asks the database only for live, unconcluded, runnable trials", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([] as never);
    zones();
    await runVerdictSweep(step, now);
    expect(vi.mocked(db.hunch.findMany).mock.calls[0][0]!.where).toEqual({
      status: "running",
      archivedAt: null,
      verdict: null,
      protocol: { startedAt: { not: null }, safetyState: { not: "observe-only" } },
    });
  });
});
