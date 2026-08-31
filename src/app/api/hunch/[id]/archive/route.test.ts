import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/db", () => ({
  db: { hunch: { updateMany: vi.fn(), findFirst: vi.fn() } },
}));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const req = (body?: unknown) =>
  new Request("http://t/api/hunch/h1/archive", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = { params: Promise.resolve({ id: "h1" }) };

describe("POST /api/hunch/[id]/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(db.hunch.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.hunch.findFirst).mockResolvedValue(null as never);
  });

  it("rejects a signed-out caller", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    expect((await POST(req({ archived: true }), params)).status).toBe(401);
    expect(db.hunch.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a body that doesn't say which way", async () => {
    const res = await POST(req({}), params);
    expect(res.status).toBe(400);
    expect(db.hunch.updateMany).not.toHaveBeenCalled();
  });

  it("stamps archivedAt when archiving", async () => {
    const res = await POST(req({ archived: true }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "h1", archived: true });
    const arg = vi.mocked(db.hunch.updateMany).mock.calls[0][0] as {
      where: { id: string; userId: string };
      data: { archivedAt: Date | null };
    };
    // A running trial can't be filed away, whoever is asking.
    expect(arg.where).toEqual({ id: "h1", userId: "u1", status: { not: "running" } });
    expect(arg.data.archivedAt).toBeInstanceOf(Date);
  });

  it("clears archivedAt when restoring, with no status guard in the way", async () => {
    const res = await POST(req({ archived: false }), params);
    expect(res.status).toBe(200);
    const arg = vi.mocked(db.hunch.updateMany).mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: { archivedAt: Date | null };
    };
    // Restoring is always allowed — the row is already out of the way.
    expect(arg.where).toEqual({ id: "h1", userId: "u1" });
    expect(arg.data.archivedAt).toBeNull();
  });

  it("refuses to archive a trial that is still running", async () => {
    // The guard held: nothing updated, but the hunch is theirs.
    vi.mocked(db.hunch.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(db.hunch.findFirst).mockResolvedValue({ id: "h1" } as never);

    const res = await POST(req({ archived: true }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/finish or abandon/i);
  });

  it("404s a hunch the user doesn't own", async () => {
    vi.mocked(db.hunch.updateMany).mockResolvedValue({ count: 0 } as never);
    expect((await POST(req({ archived: true }), params)).status).toBe(404);
  });
});
