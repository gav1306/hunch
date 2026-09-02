import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/db", () => ({
  db: {
    hunch: { findFirst: vi.fn() },
    checkIn: { upsert: vi.fn(async () => ({ id: "c1", phase: "A" })), findMany: vi.fn(async () => []) },
    checkInValue: { upsert: vi.fn() },
  },
}));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const req = (body: unknown) =>
  new Request("http://t/api/hunch/h1/checkin", { method: "POST", body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: "h1" }) };

/** UTC midnight, `n` days ago. */
const daysAgo = (n: number) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - n * 86_400_000);
};

// A running trial whose schedule puts today inside phase A.
const running = {
  id: "h1",
  status: "running",
  hypothesis: { outcomeType: "continuous" },
  protocol: {
    startedAt: new Date(),
    safetyState: "approved",
    design: {
      phases: [
        { label: "A", kind: "baseline", days: 7, name: "Baseline", action: "log it" },
        { label: "B", kind: "intervention", days: 7, name: "Change", action: "do it" },
      ],
      washoutDays: 0,
      controls: [],
      instructions: "log daily",
    },
  },
  parameters: [
    { id: "p1", label: "hours of sleep", type: "amount", min: null, max: null, isPrimary: true, retiredAt: null },
    { id: "p2", label: "stress", type: "amount", min: 1, max: 10, isPrimary: false, retiredAt: null },
  ],
};

describe("POST /api/hunch/[id]/checkin", () => {
  it("refuses a reading for a retired tracker, and writes nothing", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...running,
      parameters: [
        running.parameters[0],
        { ...running.parameters[1], retiredAt: new Date("2026-09-01T00:00:00.000Z") },
      ],
    } as never);

    const res = await POST(
      req({ values: [{ parameterId: "p1", value: 7 }, { parameterId: "p2", value: 3 }] }),
      params,
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "You stopped tracking stress." });
    // Validation runs before any write, so a rejected day leaves no rows behind
    // — not even the check-in bucket the readings would have hung off.
    expect(db.checkIn.upsert).not.toHaveBeenCalled();
    expect(db.checkInValue.upsert).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(db.hunch.findFirst).mockResolvedValue(running as never);
  });

  it("writes one CheckInValue per submitted parameter", async () => {
    const res = await POST(
      req({ values: [{ parameterId: "p1", value: 7.5 }, { parameterId: "p2", value: 4 }] }),
      params,
    );
    expect(res.status).toBe(201);
    expect(db.checkInValue.upsert).toHaveBeenCalledTimes(2);
  });

  it("accepts a partial payload", async () => {
    const res = await POST(req({ values: [{ parameterId: "p2", value: 4 }] }), params);
    expect(res.status).toBe(201);
    expect(db.checkInValue.upsert).toHaveBeenCalledTimes(1);
  });

  it("400s on a value outside a parameter's bounds and writes nothing", async () => {
    const res = await POST(req({ values: [{ parameterId: "p2", value: 99 }] }), params);
    expect(res.status).toBe(400);
    expect(db.checkInValue.upsert).not.toHaveBeenCalled();
  });

  it("400s on a parameter that does not belong to this hunch", async () => {
    const res = await POST(req({ values: [{ parameterId: "nope", value: 1 }] }), params);
    expect(res.status).toBe(400);
    expect(db.checkInValue.upsert).not.toHaveBeenCalled();
  });

  it("400s on an empty payload", async () => {
    const res = await POST(req({ values: [] }), params);
    expect(res.status).toBe(400);
  });

  it("409s when the trial is not running", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({ ...running, status: "sharpened" } as never);
    const res = await POST(req({ values: [{ parameterId: "p1", value: 7 }] }), params);
    expect(res.status).toBe(409);
  });

  describe("correcting an earlier day", () => {
    const started = { ...running, protocol: { ...running.protocol, startedAt: daysAgo(3) } };

    beforeEach(() => {
      vi.mocked(db.hunch.findFirst).mockResolvedValue(started as never);
    });

    it("files the reading under the day it is for, with that day's phase", async () => {
      const res = await POST(
        req({ values: [{ parameterId: "p1", value: 6 }], loggedOn: daysAgo(2).toISOString() }),
        params,
      );
      expect(res.status).toBe(201);
      expect(db.checkIn.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hunchId_loggedOn: { hunchId: "h1", loggedOn: daysAgo(2) } },
        }),
      );
    });

    it("refuses a day before the trial began", async () => {
      const res = await POST(
        req({ values: [{ parameterId: "p1", value: 6 }], loggedOn: daysAgo(9).toISOString() }),
        params,
      );
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/before this trial/i);
      expect(db.checkInValue.upsert).not.toHaveBeenCalled();
    });

    it("refuses a day that hasn't happened", async () => {
      const res = await POST(
        req({ values: [{ parameterId: "p1", value: 6 }], loggedOn: daysAgo(-1).toISOString() }),
        params,
      );
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/hasn't happened/i);
      expect(db.checkInValue.upsert).not.toHaveBeenCalled();
    });

    it("refuses a rest day", async () => {
      vi.mocked(db.hunch.findFirst).mockResolvedValue({
        ...started,
        protocol: {
          ...started.protocol,
          startedAt: daysAgo(3),
          design: {
            ...started.protocol.design,
            phases: [
              { label: "A", kind: "baseline", days: 2, name: "Baseline", action: "log it" },
              { label: "B", kind: "intervention", days: 7, name: "Change", action: "do it" },
            ],
            washoutDays: 2,
          },
        },
      } as never);
      // Days 3 and 4 are washout; two days ago is day 2 of the trial... day 3.
      const res = await POST(
        req({ values: [{ parameterId: "p1", value: 6 }], loggedOn: daysAgo(1).toISOString() }),
        params,
      );
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/rest day/i);
    });

    it("rejects a date it can't read", async () => {
      const res = await POST(
        req({ values: [{ parameterId: "p1", value: 6 }], loggedOn: "not-a-date" }),
        params,
      );
      expect(res.status).toBe(400);
    });
  });
});