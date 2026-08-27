import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/db", () => ({
  db: { hunch: { findFirst: vi.fn(), deleteMany: vi.fn() } },
}));

import { DELETE } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const req = () => new Request("http://t/api/hunch/h1", { method: "DELETE" });
const params = { params: Promise.resolve({ id: "h1" }) };

describe("DELETE /api/hunch/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(db.hunch.deleteMany).mockResolvedValue({ count: 1 } as never);
  });

  it("rejects a signed-out caller", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    expect((await DELETE(req(), params)).status).toBe(401);
    expect(db.hunch.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes only the caller's own hunch", async () => {
    const res = await DELETE(req(), params);
    expect(res.status).toBe(200);
    expect(db.hunch.deleteMany).toHaveBeenCalledWith({ where: { id: "h1", userId: "u1" } });
  });

  it("404s someone else's hunch instead of throwing", async () => {
    vi.mocked(db.hunch.deleteMany).mockResolvedValue({ count: 0 } as never);
    const res = await DELETE(req(), params);
    expect(res.status).toBe(404);
  });
});
