import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/memory/recall", () => ({ recallPriors: vi.fn(async () => []) }));
vi.mock("@/mastra/agents/hypothesis-coach", () => ({ sharpenHunch: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { hunch: { create: vi.fn() } },
}));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sharpenHunch } from "@/mastra/agents/hypothesis-coach";

const req = (body: unknown) =>
  new Request("http://t/api/hunch", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/hunch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
  });

  it("persists the outcome as the primary parameter plus the proposed trackers", async () => {
    vi.mocked(sharpenHunch).mockResolvedValue({
      statement: "Coffee after lunch makes me sleep worse.",
      outcomeMetric: "hours of sleep from a tracker",
      outcomeType: "continuous",
      confounders: [],
      trackers: [{ label: "stress", type: "amount", unit: "1-10", min: 1, max: 10 }],
    });
    vi.mocked(db.hunch.create).mockResolvedValue({
      id: "h1",
      hypothesis: {},
      parameters: [],
    } as never);

    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
    expect(res.status).toBe(201);

    const arg = vi.mocked(db.hunch.create).mock.calls[0][0] as {
      data: { parameters: { create: { label: string; isPrimary: boolean; sortOrder: number }[] } };
      include: { parameters: unknown };
    };
    const created = arg.data.parameters.create;
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      label: "hours of sleep from a tracker",
      isPrimary: true,
      sortOrder: 0,
    });
    expect(created[1]).toMatchObject({ label: "stress", isPrimary: false, sortOrder: 1 });
    expect(arg.include.parameters).toBeTruthy();
  });

  it("502s when the coach throws", async () => {
    vi.mocked(sharpenHunch).mockRejectedValue(new Error("bedrock down"));
    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
    expect(res.status).toBe(502);
  });
});
