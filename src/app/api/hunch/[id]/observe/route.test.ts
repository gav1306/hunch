import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { hunch: { findFirst: vi.fn() }, protocol: { upsert: vi.fn() } },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { POST } from "./route";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

const params = { params: Promise.resolve({ id: "h1" }) };
const req = () => new Request("http://localhost/api/hunch/h1/observe", { method: "POST" });

const sharpened = {
  id: "h1",
  userId: "u1",
  hypothesis: { outcomeMetric: "tiredness rated 1-5" },
  protocol: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ user: { id: "u1" } } as never);
  vi.mocked(db.hunch.findFirst).mockResolvedValue(sharpened as never);
  vi.mocked(db.protocol.upsert).mockImplementation((async ({
    create,
  }: {
    create: Record<string, unknown>;
  }) => ({ id: "pr1", startedAt: null, ...create })) as never);
});

describe("POST /api/hunch/[id]/observe", () => {
  it("writes a one-phase protocol marked observe-only", async () => {
    const res = await POST(req(), params);
    expect(res.status).toBe(201);

    const arg = vi.mocked(db.protocol.upsert).mock.calls[0][0] as unknown as {
      create: { safetyState: string; design: { phases: unknown[] }; startedAt?: unknown };
    };
    expect(arg.create.safetyState).toBe("observe-only");
    expect(arg.create.design.phases).toHaveLength(1);
    // Starting stays the user's own act, exactly as for a designed trial.
    expect(arg.create.startedAt).toBeUndefined();
  });

  it("names the outcome in the phase action", async () => {
    await POST(req(), params);
    const arg = vi.mocked(db.protocol.upsert).mock.calls[0][0] as unknown as {
      create: { design: { phases: { action: string }[] } };
    };
    expect(arg.create.design.phases[0].action).toContain("tiredness rated 1-5");
  });

  it("409s a hunch with no hypothesis — there is nothing to log yet", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({ ...sharpened, hypothesis: null } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    expect(db.protocol.upsert).not.toHaveBeenCalled();
  });

  it("409s a trial already under way rather than converting it underneath", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...sharpened,
      protocol: { startedAt: new Date("2026-08-01T00:00:00.000Z") },
    } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    expect(db.protocol.upsert).not.toHaveBeenCalled();
  });

  it("404s a hunch that isn't theirs", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(null as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(404);
  });

  it("401s without a session", async () => {
    vi.mocked(getSession).mockResolvedValue(null as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(401);
  });
});
