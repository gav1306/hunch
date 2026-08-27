import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/lib/memory/recall", () => ({ recallPriors: vi.fn(async () => []) }));
vi.mock("@/mastra/agents/clarifier", () => ({ askClarifying: vi.fn() }));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { askClarifying } from "@/mastra/agents/clarifier";

const req = (body: unknown) =>
  new Request("http://t/api/hunch/clarify", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/hunch/clarify", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401s when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    const res = await POST(req({ rawText: "x" }));
    expect(res.status).toBe(401);
  });

  it("400s on empty hunch", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await POST(req({ rawText: "" }));
    expect(res.status).toBe(400);
  });

  it("returns questions on success", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(askClarifying).mockResolvedValue({
      questions: [{ id: "outcome", prompt: "How?", options: ["a", "b"], allowOther: true }],
    });
    const res = await POST(req({ rawText: "coffee wrecks sleep" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toHaveLength(1);
  });
});
