import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/mastra/workflows/design", () => ({
  designProtocol: vi.fn(),
  resolveSafetyState: vi.fn(() => "approved"),
}));
vi.mock("@/lib/db", () => {
  const tx = {
    parameter: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn(async () => []) },
    protocol: { upsert: vi.fn(async () => ({ id: "pr1", safetyState: "approved" })) },
    hunch: { update: vi.fn() },
  };
  return {
    db: {
      hunch: { findFirst: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  };
});

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { designProtocol } from "@/mastra/workflows/design";

const tx = (db as unknown as { __tx: Record<string, Record<string, ReturnType<typeof vi.fn>>> }).__tx;

const req = (body: unknown) =>
  new Request("http://t/api/hunch/h1/protocol", { method: "POST", body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: "h1" }) };

const sharpened = {
  id: "h1",
  status: "sharpened",
  hypothesis: {
    statement: "s",
    outcomeMetric: "hours of sleep",
    outcomeType: "continuous",
    confounders: [],
  },
  _count: { checkIns: 0 },
};

describe("POST /api/hunch/[id]/protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(db.hunch.findFirst).mockResolvedValue(sharpened as never);
    vi.mocked(designProtocol).mockResolvedValue({
      design: {}, powerInfo: {}, confounders: [], safety: { state: "approved", reason: "r", routedToDoctor: false },
    } as never);
  });

  it("400s when the confirmed list has no primary", async () => {
    const res = await POST(
      req({ parameters: [{ label: "stress", type: "continuous", isPrimary: false }] }),
      params,
    );
    expect(res.status).toBe(400);
    expect(designProtocol).not.toHaveBeenCalled();
  });

  it("400s when the confirmed list is empty", async () => {
    const res = await POST(req({ parameters: [] }), params);
    expect(res.status).toBe(400);
  });

  it("replaces the parameter set inside the protocol transaction", async () => {
    const res = await POST(
      req({
        parameters: [
          { label: "hours of sleep", type: "continuous", isPrimary: true },
          { label: "stress", type: "continuous", unit: "1-10", min: 1, max: 10, isPrimary: false },
        ],
      }),
      params,
    );
    expect(res.status).toBe(201);
    expect(tx.parameter.deleteMany).toHaveBeenCalledWith({ where: { hunchId: "h1" } });
    const created = vi.mocked(tx.parameter.createMany).mock.calls[0][0] as {
      data: { label: string; isPrimary: boolean; sortOrder: number }[];
    };
    expect(created.data).toHaveLength(2);
    expect(created.data[0]).toMatchObject({ isPrimary: true, sortOrder: 0 });
    expect(created.data[1]).toMatchObject({ label: "stress", min: 1, max: 10, sortOrder: 1 });
  });

  it("409s once days have been logged, so a redesign can't erase them", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...sharpened,
      _count: { checkIns: 4 },
    } as never);
    const res = await POST(
      req({ parameters: [{ label: "hours of sleep", type: "continuous", isPrimary: true }] }),
      params,
    );
    expect(res.status).toBe(409);
    expect(designProtocol).not.toHaveBeenCalled();
    expect(tx.parameter.deleteMany).not.toHaveBeenCalled();
  });

  it("409s when the hunch was never sharpened", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({ id: "h1", status: "draft" } as never);
    const res = await POST(
      req({ parameters: [{ label: "x", type: "binary", isPrimary: true }] }),
      params,
    );
    expect(res.status).toBe(409);
  });
});
