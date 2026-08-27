import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/memory/recall", () => ({ recallPriors: vi.fn(async () => []) }));
vi.mock("@/mastra/agents/hypothesis-coach", () => ({ sharpenHunch: vi.fn() }));

const tx = {
  parameter: { deleteMany: vi.fn() },
  protocol: { deleteMany: vi.fn() },
  hunch: { update: vi.fn(async () => ({ id: "h1", hypothesis: {}, parameters: [] })) },
};
vi.mock("@/lib/db", () => ({
  db: {
    hunch: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  },
}));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sharpenHunch } from "@/mastra/agents/hypothesis-coach";

const req = (body: unknown) =>
  new Request("http://t/api/hunch/h1/sharpen", { method: "POST", body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: "h1" }) };

const sharpened = {
  statement: "Coffee after 2pm costs me sleep.",
  outcomeMetric: "hours of sleep",
  outcomeType: "continuous" as const,
  confounders: ["alcohol"],
  trackers: [],
};

/** Sharpened, nothing designed, nothing logged — a hunch on the confirm gate. */
const gate = { id: "h1", status: "sharpened", protocol: null, _count: { checkIns: 0 } };

describe("POST /api/hunch/[id]/sharpen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(db.hunch.findFirst).mockResolvedValue(gate as never);
    vi.mocked(sharpenHunch).mockResolvedValue(sharpened as never);
  });

  it("rejects a signed-out caller", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    expect((await POST(req({ rawText: "x" }), params)).status).toBe(401);
  });

  it("404s a hunch the user doesn't own", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(null as never);
    expect((await POST(req({ rawText: "x" }), params)).status).toBe(404);
  });

  it("re-sharpens the same hunch rather than creating a new one", async () => {
    const res = await POST(req({ rawText: "coffee wrecks my sleep" }), params);
    expect(res.status).toBe(200);
    expect(tx.hunch.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "h1" } }),
    );
  });

  it("clears the parameters and protocol the old hypothesis owned", async () => {
    await POST(req({ rawText: "coffee wrecks my sleep" }), params);
    expect(tx.parameter.deleteMany).toHaveBeenCalledWith({ where: { hunchId: "h1" } });
    expect(tx.protocol.deleteMany).toHaveBeenCalledWith({ where: { hunchId: "h1" } });
  });

  it("refuses once days are logged", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...gate,
      _count: { checkIns: 3 },
    } as never);
    const res = await POST(req({ rawText: "x" }), params);
    expect(res.status).toBe(409);
    expect(tx.hunch.update).not.toHaveBeenCalled();
  });

  it("refuses once the trial has started", async () => {
    // The logged days are evidence about the old statement.
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...gate,
      protocol: { startedAt: new Date() },
    } as never);
    expect((await POST(req({ rawText: "x" }), params)).status).toBe(409);
    expect(tx.hunch.update).not.toHaveBeenCalled();
  });

  it("answers with JSON when the coach fails", async () => {
    vi.mocked(sharpenHunch).mockRejectedValue(new Error("model down"));
    const res = await POST(req({ rawText: "x" }), params);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBeTruthy();
  });
});
