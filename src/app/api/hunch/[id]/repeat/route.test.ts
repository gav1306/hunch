import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/db", () => ({
  db: { hunch: { findFirst: vi.fn(), create: vi.fn() } },
}));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const params = { params: Promise.resolve({ id: "h1" }) };
const req = () => new Request("http://t/api/hunch/h1/repeat", { method: "POST" });

/** A concluded hunch with everything a repeat needs to copy. */
const source = {
  id: "h1",
  rawText: "does coffee after lunch wreck my sleep",
  hypothesis: {
    statement: "Coffee after 2pm reduces my sleep quality.",
    outcomeMetric: "sleep quality",
    outcomeType: "continuous",
    confounders: ["alcohol"],
  },
  protocol: {
    design: { phases: [], washoutDays: 1, controls: [], instructions: "x" },
    powerInfo: { minDaysPerPhase: 7 },
    confounders: [{ name: "alcohol" }],
    safetyState: "approved",
  },
  parameters: [
    { label: "sleep quality", type: "continuous", unit: "1-10", min: 1, max: 10, isPrimary: true, sortOrder: 0 },
    { label: "caffeine", type: "binary", unit: null, min: null, max: null, isPrimary: false, sortOrder: 1 },
  ],
};

describe("POST /api/hunch/[id]/repeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(db.hunch.findFirst).mockResolvedValue(source as never);
    vi.mocked(db.hunch.create).mockResolvedValue({ id: "h2" } as never);
  });

  it("rejects a signed-out caller", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    expect((await POST(req(), params)).status).toBe(401);
    expect(db.hunch.create).not.toHaveBeenCalled();
  });

  it("404s a hunch the user doesn't own", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(null as never);
    expect((await POST(req(), params)).status).toBe(404);
  });

  it("refuses a hunch with no plan to repeat", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({ ...source, protocol: null } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/plan/i);
    expect(db.hunch.create).not.toHaveBeenCalled();
  });

  it("clones the hypothesis, plan and parameters into an unstarted hunch", async () => {
    const res = await POST(req(), params);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "h2" });

    const arg = vi.mocked(db.hunch.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    const data = arg.data as {
      userId: string;
      rawText: string;
      status: string;
      hypothesis: { create: { statement: string } };
      protocol: { create: { startedAt: null; safetyState: string } };
      parameters: { create: { label: string; isPrimary: boolean }[] };
    };
    expect(data.userId).toBe("u1");
    expect(data.rawText).toBe(source.rawText);
    // A repeat is a designed hunch waiting to be started, never a running one.
    expect(data.status).toBe("sharpened");
    expect(data.protocol.create.startedAt).toBeNull();
    expect(data.protocol.create.safetyState).toBe("approved");
    expect(data.hypothesis.create.statement).toBe(source.hypothesis.statement);
    expect(data.parameters.create.map((p) => p.label)).toEqual([
      "sleep quality",
      "caffeine",
    ]);
    expect(data.parameters.create.filter((p) => p.isPrimary)).toHaveLength(1);
  });

  it("carries no check-ins or verdict across", async () => {
    await POST(req(), params);
    const data = (vi.mocked(db.hunch.create).mock.calls[0][0] as { data: object }).data;
    expect(data).not.toHaveProperty("checkIns");
    expect(data).not.toHaveProperty("verdict");
  });
});
