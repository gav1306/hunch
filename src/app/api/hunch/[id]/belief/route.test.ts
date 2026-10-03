import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/db", () => ({ db: { hunch: { findFirst: vi.fn() } } }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/zone", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/zone")>()),
  userTimeZone: vi.fn(async () => "UTC"),
}));

import { GET } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const DAY = 86_400_000;
const utcToday = () => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

/** A 7+7-day trial whose last scheduled day was `endedAgo` days ago (0 = today). */
function trial(endedAgo: number, status = "running") {
  return {
    id: "h1",
    status,
    hypothesis: { outcomeType: "continuous", outcomeMetric: "energy" },
    protocol: {
      startedAt: new Date(utcToday() - (13 + endedAgo) * DAY),
      safetyState: "approved",
      design: {
        phases: [
          { label: "A", kind: "baseline", days: 7, name: "A", action: "a" },
          { label: "B", kind: "intervention", days: 7, name: "B", action: "b" },
        ],
        washoutDays: 0,
        controls: [],
        instructions: "x",
        shape: "phased",
      },
    },
    parameters: [],
    checkIns: [],
  };
}

const read = async () =>
  (await GET(new Request("http://t/api/hunch/h1/belief"), {
    params: Promise.resolve({ id: "h1" }),
  })).json();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
});

describe("belief inGrace", () => {
  it("is false on the last scheduled day", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(trial(0) as never);
    expect((await read()).inGrace).toBe(false);
  });

  it("is true the day after the schedule ends, while the trial still runs", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(trial(1) as never);
    const body = await read();
    expect(body.schedule.done).toBe(true);
    expect(body.inGrace).toBe(true);
  });

  it("is false once the grace day has passed", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(trial(2) as never);
    expect((await read()).inGrace).toBe(false);
  });

  it("is false when the verdict is already in", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(trial(1, "concluded") as never);
    expect((await read()).inGrace).toBe(false);
  });
});
