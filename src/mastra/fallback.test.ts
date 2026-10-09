import { describe, expect, it, vi } from "vitest";
import { Agent } from "@mastra/core/agent";

/** A model whose provider is down. */
const down = {
  specificationVersion: "v3",
  provider: "down",
  modelId: "down-model",
  supportedUrls: {},
  doGenerate: vi.fn(async () => {
    throw new Error("503 Service Unavailable");
  }),
  doStream: vi.fn(async () => {
    throw new Error("503 Service Unavailable");
  }),
};

/** A model that answers "from backup". */
const up = {
  specificationVersion: "v3",
  provider: "up",
  modelId: "up-model",
  supportedUrls: {},
  doGenerate: vi.fn(async () => ({
    content: [{ type: "text", text: "from backup" }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 2, text: 2, reasoning: 0 },
    },
    warnings: [],
    request: { body: "" },
    response: { headers: {} },
  })),
  doStream: vi.fn(async () => ({
    request: { body: "" },
    response: { headers: {} },
    stream: new ReadableStream({
      start(c) {
        c.enqueue({ type: "stream-start", warnings: [] });
        c.enqueue({ type: "text-start", id: "t" });
        c.enqueue({ type: "text-delta", id: "t", delta: "from backup" });
        c.enqueue({ type: "text-end", id: "t" });
        c.enqueue({
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 2, text: 2, reasoning: 0 },
          },
        });
        c.close();
      },
    }),
  })),
};

describe("Mastra model fallback, as model.ts configures it", () => {
  it("answers from the backup provider when the chosen one fails", async () => {
    const agent = new Agent({
      id: "t",
      name: "t",
      instructions: "x",
      model: [
        { model: down as never, maxRetries: 0 },
        { model: up as never, maxRetries: 0 },
      ],
    });

    const res = await agent.generate("hi");

    expect(down.doStream.mock.calls.length + down.doGenerate.mock.calls.length).toBeGreaterThan(0);
    expect(res.text).toBe("from backup");
  });
});
