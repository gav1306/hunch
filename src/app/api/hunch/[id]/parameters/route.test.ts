import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { hunch: { findFirst: vi.fn() }, parameter: { create: vi.fn() } },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

import { POST } from "./route";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

const params = { params: Promise.resolve({ id: "h1" }) };
const req = (body: unknown) =>
  new Request("http://localhost/api/hunch/h1/parameters", {
    method: "POST",
    body: JSON.stringify(body),
  });

const running = {
  id: "h1",
  userId: "u1",
  protocol: { startedAt: new Date("2026-08-01T00:00:00.000Z") },
  parameters: [
    { id: "p1", label: "sleep", isPrimary: true, retiredAt: null, sortOrder: 0 },
    { id: "p2", label: "stress", isPrimary: false, retiredAt: null, sortOrder: 1 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ user: { id: "u1" } } as never);
  vi.mocked(db.hunch.findFirst).mockResolvedValue(running as never);
  vi.mocked(db.parameter.create).mockImplementation((async ({
    data,
  }: {
    data: Record<string, unknown>;
  }) => ({ id: "p3", unit: null, min: null, max: null, retiredAt: null, ...data })) as never);
});

describe("POST /api/hunch/[id]/parameters", () => {
  it("adds a tracker after the existing rows", async () => {
    const res = await POST(req({ label: "Coffees", type: "count" }), params);
    expect(res.status).toBe(201);
    const arg = vi.mocked(db.parameter.create).mock.calls[0][0] as unknown as {
      data: { hunchId: string; isPrimary: boolean; sortOrder: number };
    };
    expect(arg.data).toMatchObject({ hunchId: "h1", isPrimary: false, sortOrder: 2 });
  });

  it("never lets a new row claim primary, whatever the payload says", async () => {
    await POST(req({ label: "Coffees", type: "count", isPrimary: true }), params);
    const arg = vi.mocked(db.parameter.create).mock.calls[0][0] as unknown as {
      data: { isPrimary: boolean };
    };
    expect(arg.data.isPrimary).toBe(false);
  });

  it("refuses once five are already active", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...running,
      parameters: Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`,
        label: `p${i}`,
        isPrimary: i === 0,
        retiredAt: null,
        sortOrder: i,
      })),
    } as never);
    const res = await POST(req({ label: "One more", type: "count" }), params);
    expect(res.status).toBe(409);
    expect(db.parameter.create).not.toHaveBeenCalled();
  });

  it("counts retired rows against nothing", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...running,
      parameters: [
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `r${i}`,
          label: `r${i}`,
          isPrimary: false,
          retiredAt: new Date(),
          sortOrder: i,
        })),
        { id: "p1", label: "sleep", isPrimary: true, retiredAt: null, sortOrder: 5 },
      ],
    } as never);
    const res = await POST(req({ label: "Coffees", type: "count" }), params);
    expect(res.status).toBe(201);
  });

  it("refuses before the trial has started — redesign is the path then", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...running,
      protocol: { startedAt: null },
    } as never);
    const res = await POST(req({ label: "Coffees", type: "count" }), params);
    expect(res.status).toBe(409);
    expect(db.parameter.create).not.toHaveBeenCalled();
  });

  it("404s a hunch that isn't theirs", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(null as never);
    const res = await POST(req({ label: "Coffees", type: "count" }), params);
    expect(res.status).toBe(404);
  });

  it("400s an unusable payload", async () => {
    const res = await POST(req({ label: "", type: "count" }), params);
    expect(res.status).toBe(400);
  });

  it("401s without a session", async () => {
    vi.mocked(getSession).mockResolvedValue(null as never);
    const res = await POST(req({ label: "Coffees", type: "count" }), params);
    expect(res.status).toBe(401);
  });
});
