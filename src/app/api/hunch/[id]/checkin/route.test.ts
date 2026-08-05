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
    { id: "p1", label: "hours of sleep", type: "continuous", min: null, max: null, isPrimary: true },
    { id: "p2", label: "stress", type: "continuous", min: 1, max: 10, isPrimary: false },
  ],
};

describe("POST /api/hunch/[id]/checkin", () => {
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
});
