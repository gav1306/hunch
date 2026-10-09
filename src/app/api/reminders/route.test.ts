import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock("server-only", () => ({}));

import { GET, PUT } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const put = (body: unknown) =>
  new Request("http://t/api/reminders", { method: "PUT", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
});

describe("reminders zone", () => {
  it("shows a zone saved under a legacy alias by its current name", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ reminderHour: 8, timeZone: "Asia/Calcutta" } as never);
    const res = await GET();
    expect(await res.json()).toMatchObject({ reminderHour: 8, timeZone: "Asia/Kolkata" });
  });

  it("says whether the address is verified, since reminders wait on it", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({
      reminderHour: 20,
      timeZone: "UTC",
      email: "a@b.test",
      emailVerified: false,
    } as never);
    const body = await (await GET()).json();
    expect(body).toMatchObject({ email: "a@b.test", emailVerified: false });
    expect(vi.mocked(db.user.findUnique).mock.calls[0][0].select).toMatchObject({
      email: true,
      emailVerified: true,
    });
  });

  it("stores the current name when the browser sends the alias", async () => {
    vi.mocked(db.user.update).mockResolvedValue({ reminderHour: 9, timeZone: "Asia/Kolkata" } as never);
    await PUT(put({ reminderHour: 9, timeZone: "Asia/Calcutta" }));
    expect(vi.mocked(db.user.update).mock.calls[0][0].data).toMatchObject({ timeZone: "Asia/Kolkata" });
  });
});
