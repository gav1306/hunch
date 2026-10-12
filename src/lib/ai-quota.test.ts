import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: vi.fn() } }));

import { db } from "@/lib/db";
import { DEFAULT_DAILY_AI_LIMIT, spendAiCall } from "@/lib/ai-quota";

const spentSoFar = (calls: number) => vi.mocked(db.$queryRaw).mockResolvedValue([{ calls }] as never);

describe("spendAiCall", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lets a call through while the user is under today's limit", async () => {
    spentSoFar(DEFAULT_DAILY_AI_LIMIT);
    expect(await spendAiCall("u1")).toBeNull();
  });

  it("answers 429 with the limit once the user is over it", async () => {
    spentSoFar(DEFAULT_DAILY_AI_LIMIT + 1);
    const res = await spendAiCall("u1");
    expect(res?.status).toBe(429);
    expect((await res!.json()).error).toContain(String(DEFAULT_DAILY_AI_LIMIT));
  });

  it("reads the limit from AI_DAILY_LIMIT", async () => {
    vi.stubEnv("AI_DAILY_LIMIT", "3");
    spentSoFar(4);
    expect((await spendAiCall("u1"))?.status).toBe(429);
  });

  it("counts in one atomic statement, so parallel requests can't both slip under", async () => {
    spentSoFar(1);
    await spendAiCall("u1");
    const sql = (vi.mocked(db.$queryRaw).mock.calls[0][0] as unknown as string[]).join("?");
    expect(sql).toMatch(/ON CONFLICT/);
    expect(sql).toMatch(/RETURNING/);
  });
});
