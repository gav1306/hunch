import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/db", () => ({
  db: {
    hunch: { findFirst: vi.fn(), update: vi.fn(() => "hunch-update") },
    protocol: { update: vi.fn(() => "protocol-update") },
    $transaction: vi.fn(async () => []),
  },
}));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const req = (body?: unknown) =>
  new Request("http://t/api/hunch/h1/start", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = { params: Promise.resolve({ id: "h1" }) };

/** Designed, safety-approved, never started — what the protocol page hands over. */
const designed = {
  id: "h1",
  status: "sharpened",
  protocol: { hunchId: "h1", safetyState: "approved", startedAt: null },
};

describe("POST /api/hunch/[id]/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(db.hunch.findFirst).mockResolvedValue(designed as never);
  });

  it("rejects a signed-out caller", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    expect((await POST(req({ startOn: "today" }), params)).status).toBe(401);
  });

  it("404s a hunch the user doesn't own", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(null as never);
    expect((await POST(req({ startOn: "today" }), params)).status).toBe(404);
  });

  it("refuses a hunch with no protocol", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({ ...designed, protocol: null } as never);
    const res = await POST(req({ startOn: "today" }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/design a plan/i);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a plan that hasn't cleared safety", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...designed,
      protocol: { ...designed.protocol, safetyState: "blocked" },
    } as never);
    expect((await POST(req({ startOn: "today" }), params)).status).toBe(409);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses to re-anchor a trial that already started", async () => {
    // Re-starting would move the date every logged day is measured from.
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...designed,
      status: "running",
      protocol: { ...designed.protocol, startedAt: new Date("2026-08-01T00:00:00Z") },
    } as never);
    const res = await POST(req({ startOn: "today" }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already started/i);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a startOn it doesn't recognise", async () => {
    const res = await POST(req({ startOn: "next monday" }), params);
    expect(res.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("anchors a 'today' start at midnight UTC and flips the hunch to running", async () => {
    const res = await POST(req({ startOn: "today" }), params);
    expect(res.status).toBe(200);

    const { startedAt, status } = await res.json();
    expect(status).toBe("running");
    expect(new Date(startedAt).toISOString()).toMatch(/T00:00:00\.000Z$/);

    expect(db.protocol.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hunchId: "h1" } }),
    );
    expect(db.hunch.update).toHaveBeenCalledWith({
      where: { id: "h1" },
      data: { status: "running" },
    });
    // Anchor and status move together or not at all.
    expect(db.$transaction).toHaveBeenCalledWith(["protocol-update", "hunch-update"]);
  });

  it("anchors a 'tomorrow' start one day ahead", async () => {
    const res = await POST(req({ startOn: "tomorrow" }), params);
    expect(res.status).toBe(200);

    const { startedAt } = await res.json();
    const anchor = new Date(startedAt);
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    expect(anchor.getTime() - todayUtc).toBe(86_400_000);
  });

  it("defaults to starting today when the body says nothing", async () => {
    expect((await POST(req({}), params)).status).toBe(200);
  });
});
