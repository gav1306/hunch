import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { parameter: { findFirst: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { PATCH } from "./route";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

const params = { params: Promise.resolve({ id: "h1", parameterId: "p2" }) };
const req = (body: unknown) =>
  new Request("http://localhost/api/hunch/h1/parameters/p2", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

const tracker = {
  id: "p2",
  hunchId: "h1",
  label: "stress",
  type: "scale",
  unit: "1-5",
  min: 1,
  max: 5,
  isPrimary: false,
  sortOrder: 1,
  retiredAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ user: { id: "u1" } } as never);
  vi.mocked(db.parameter.findFirst).mockResolvedValue(tracker as never);
  vi.mocked(db.parameter.update).mockImplementation((async ({
    data,
  }: {
    data: Record<string, unknown>;
  }) => ({ ...tracker, ...data })) as never);
});

describe("PATCH /api/hunch/[id]/parameters/[parameterId]", () => {
  it("retires a tracker by stamping a date, never deleting it", async () => {
    const res = await PATCH(req({ retired: true }), params);
    expect(res.status).toBe(200);
    const arg = vi.mocked(db.parameter.update).mock.calls[0][0] as unknown as {
      data: { retiredAt: Date | null };
    };
    expect(arg.data.retiredAt).toBeInstanceOf(Date);
    expect(await res.json()).toMatchObject({ parameter: { retired: true } });
  });

  it("un-retires by clearing the date", async () => {
    vi.mocked(db.parameter.findFirst).mockResolvedValue({
      ...tracker,
      retiredAt: new Date("2026-09-01T00:00:00.000Z"),
    } as never);
    const res = await PATCH(req({ retired: false }), params);
    expect(res.status).toBe(200);
    const arg = vi.mocked(db.parameter.update).mock.calls[0][0] as unknown as {
      data: { retiredAt: Date | null };
    };
    expect(arg.data.retiredAt).toBeNull();
  });

  it("refuses to retire the primary — the verdict is built on it", async () => {
    vi.mocked(db.parameter.findFirst).mockResolvedValue({
      ...tracker,
      isPrimary: true,
    } as never);
    const res = await PATCH(req({ retired: true }), params);
    expect(res.status).toBe(409);
    expect(db.parameter.update).not.toHaveBeenCalled();
  });

  it("404s a parameter that isn't on a hunch they own", async () => {
    vi.mocked(db.parameter.findFirst).mockResolvedValue(null as never);
    const res = await PATCH(req({ retired: true }), params);
    expect(res.status).toBe(404);
  });

  it("400s a payload that doesn't say which way", async () => {
    const res = await PATCH(req({}), params);
    expect(res.status).toBe(400);
    expect(db.parameter.update).not.toHaveBeenCalled();
  });

  it("401s without a session", async () => {
    vi.mocked(getSession).mockResolvedValue(null as never);
    const res = await PATCH(req({ retired: true }), params);
    expect(res.status).toBe(401);
  });
});
