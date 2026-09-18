import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/mastra/workflows/design", () => ({
  designProtocol: vi.fn(),
  resolveSafetyState: vi.fn(() => "approved"),
}));
vi.mock("@/lib/design-draft/take", () => ({ takeDraft: vi.fn(async () => null) }));
vi.mock("@/lib/db", () => {
  const tx = {
    parameter: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn(async () => []) },
    protocol: { upsert: vi.fn(async () => ({ id: "pr1", safetyState: "approved" })) },
    hunch: { update: vi.fn() },
    hypothesis: { update: vi.fn() },
    designDraft: { deleteMany: vi.fn() },
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
import { takeDraft } from "@/lib/design-draft/take";
import { designFingerprint, designInputFor } from "@/lib/design-draft/fingerprint";

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
    schedulable: true,
  },
  protocol: null,
  _count: { checkIns: 0 },
};

/** The same hunch, but for a change that can't be applied on demand. */
const unschedulable = {
  ...sharpened,
  hypothesis: { ...sharpened.hypothesis, schedulable: false },
};

const primary = { label: "hours of sleep", type: "amount", isPrimary: true };
const exposure = {
  label: "played basketball",
  type: "binary",
  isPrimary: false,
  isExposure: true,
};

const createdRows = () =>
  (
    vi.mocked(tx.parameter.createMany).mock.calls[0][0] as unknown as {
      data: { label: string; isPrimary: boolean; isExposure: boolean; sortOrder: number }[];
    }
  ).data;

describe("POST /api/hunch/[id]/protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(db.hunch.findFirst).mockResolvedValue(sharpened as never);
    vi.mocked(designProtocol).mockResolvedValue({
      design: {}, powerInfo: {}, confounders: [], safety: { state: "approved", reason: "r", routedToDoctor: false },
    } as never);
    vi.mocked(takeDraft).mockResolvedValue(null);
  });

  it("400s when the confirmed list has no primary", async () => {
    const res = await POST(
      req({ parameters: [{ label: "stress", type: "amount", isPrimary: false }] }),
      params,
    );
    expect(res.status).toBe(400);
    expect(designProtocol).not.toHaveBeenCalled();
  });

  it("502s with a message, and writes nothing, when the designer's model call fails", async () => {
    vi.mocked(designProtocol).mockRejectedValue(new Error("402 out of credits"));
    const res = await POST(req({ parameters: [primary] }), params);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/try again/i);
    expect(tx.parameter.deleteMany).not.toHaveBeenCalled();
    expect(tx.protocol.upsert).not.toHaveBeenCalled();
  });

  it("400s when the confirmed list is empty", async () => {
    const res = await POST(req({ parameters: [] }), params);
    expect(res.status).toBe(400);
  });

  it("replaces the parameter set inside the protocol transaction", async () => {
    const res = await POST(
      req({
        parameters: [
          { label: "hours of sleep", type: "amount", isPrimary: true },
          { label: "stress", type: "scale", unit: "1-5", min: 1, max: 5, isPrimary: false },
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
    expect(created.data[1]).toMatchObject({ label: "stress", min: 1, max: 5, sortOrder: 1 });
  });

  it("409s once days have been logged, so a redesign can't erase them", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...sharpened,
      _count: { checkIns: 4 },
    } as never);
    const res = await POST(
      req({ parameters: [{ label: "hours of sleep", type: "amount", isPrimary: true }] }),
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

  it("409s once the trial has started, so the shape can't change underneath it", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...sharpened,
      protocol: { startedAt: new Date("2026-09-01") },
    } as never);
    const res = await POST(req({ parameters: [primary] }), params);
    expect(res.status).toBe(409);
    expect(designProtocol).not.toHaveBeenCalled();
    expect(tx.parameter.deleteMany).not.toHaveBeenCalled();
  });

  it("persists the confirmed isExposure flag", async () => {
    const res = await POST(req({ parameters: [primary, exposure] }), params);
    expect(res.status).toBe(201);
    expect(createdRows()[0]).toMatchObject({ isPrimary: true, isExposure: false });
    expect(createdRows()[1]).toMatchObject({ label: "played basketball", isExposure: true });
  });

  it("designs an observational window when the change can't be scheduled", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(unschedulable as never);
    const res = await POST(req({ parameters: [primary, exposure] }), params);
    expect(res.status).toBe(201);
    expect(designProtocol).toHaveBeenCalledWith(
      expect.objectContaining({ shape: "observational", exposureLabel: "played basketball" }),
    );
  });

  it("designs a phased trial when the change can be scheduled", async () => {
    const res = await POST(req({ parameters: [primary] }), params);
    expect(res.status).toBe(201);
    expect(designProtocol).toHaveBeenCalledWith(
      expect.objectContaining({ shape: "phased", exposureLabel: undefined }),
    );
  });

  it("400s when an unschedulable hunch confirms no daily yes/no", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(unschedulable as never);
    const res = await POST(req({ parameters: [primary] }), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Tell us the one yes/no we should ask each day — it's how we tell your days apart.",
    });
    expect(designProtocol).not.toHaveBeenCalled();
    expect(tx.parameter.deleteMany).not.toHaveBeenCalled();
  });

  it("takes the body's schedulable: false over the stored value, and stores it", async () => {
    const res = await POST(
      req({ schedulable: false, parameters: [primary, exposure] }),
      params,
    );
    expect(res.status).toBe(201);
    expect(designProtocol).toHaveBeenCalledWith(
      expect.objectContaining({ shape: "observational" }),
    );
    expect(tx.hypothesis.update).toHaveBeenCalledWith({
      where: { hunchId: "h1" },
      data: { schedulable: false },
    });
  });

  it("drops the exposure flag when the body flips back to schedulable", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(unschedulable as never);
    const res = await POST(
      req({ schedulable: true, parameters: [primary, exposure] }),
      params,
    );
    expect(res.status).toBe(201);
    expect(designProtocol).toHaveBeenCalledWith(expect.objectContaining({ shape: "phased" }));
    expect(createdRows().some((r) => r.isExposure)).toBe(false);
    expect(createdRows()).toHaveLength(2);
    expect(tx.hypothesis.update).toHaveBeenCalledWith({
      where: { hunchId: "h1" },
      data: { schedulable: true },
    });
  });

  it("keeps a reporting-only exposure when the body confirms an already-scheduled hunch", async () => {
    // Nothing flipped: the exposure here is the adherence count on a phased
    // trial, not an arm assignment, and this route must leave it alone.
    const res = await POST(
      req({ schedulable: true, parameters: [primary, exposure] }),
      params,
    );
    expect(res.status).toBe(201);
    expect(createdRows()[1]).toMatchObject({ label: "played basketball", isExposure: true });
    expect(designProtocol).toHaveBeenCalledWith(expect.objectContaining({ shape: "phased" }));
    expect(tx.hypothesis.update).not.toHaveBeenCalled();
  });

  it("leaves the stored schedulable alone when the body doesn't say", async () => {
    const res = await POST(req({ parameters: [primary] }), params);
    expect(res.status).toBe(201);
    expect(tx.hypothesis.update).not.toHaveBeenCalled();
  });

  it("uses a draft designed from the same inputs instead of designing again", async () => {
    const drafted = {
      design: { phases: [], washoutDays: 0, controls: [], instructions: "drafted", shape: "phased" },
      powerInfo: {},
      confounders: [],
      safety: { state: "approved", reason: "r", routedToDoctor: false },
    };
    vi.mocked(takeDraft).mockResolvedValue(drafted as never);

    const res = await POST(req({ parameters: [primary] }), params);

    expect(res.status).toBe(201);
    expect(designProtocol).not.toHaveBeenCalled();
    expect(takeDraft).toHaveBeenCalledWith(
      "h1",
      designFingerprint(designInputFor(sharpened.hypothesis, { schedulable: true })),
    );
    expect(tx.protocol.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ design: drafted.design }) }),
    );
  });

  it("looks for the draft of the shape and label the user confirmed", async () => {
    await POST(req({ parameters: [primary, exposure], schedulable: false }), params);

    expect(takeDraft).toHaveBeenCalledWith(
      "h1",
      designFingerprint(
        designInputFor(sharpened.hypothesis, { schedulable: false, exposureLabel: "played basketball" }),
      ),
    );
  });

  it("designs inline when there is no usable draft", async () => {
    const res = await POST(req({ parameters: [primary] }), params);

    expect(res.status).toBe(201);
    expect(designProtocol).toHaveBeenCalledWith(expect.objectContaining({ shape: "phased" }));
  });

  it("consumes the draft in the same transaction that saves the protocol", async () => {
    await POST(req({ parameters: [primary] }), params);

    expect(tx.designDraft.deleteMany).toHaveBeenCalledWith({ where: { hunchId: "h1" } });
  });

  it("doesn't look for a draft once days are logged", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({ ...sharpened, _count: { checkIns: 2 } } as never);

    await POST(req({ parameters: [primary] }), params);

    expect(takeDraft).not.toHaveBeenCalled();
  });
});
