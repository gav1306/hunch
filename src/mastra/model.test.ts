import { afterEach, describe, expect, it, vi } from "vitest";

/** model.ts reads env at import, so each case loads it fresh. */
async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const k of ["LLM_PROVIDER", "OPENROUTER_API_KEY", "NVIDIA_API_KEY", "LLM_MODEL_ID"]) {
    vi.stubEnv(k, env[k] ?? "");
  }
  return import("@/mastra/model");
}

const ids = (m: unknown) =>
  (m as { model: { modelId: string } }[]).map((e) => e.model.modelId);

describe("provider fallback", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("falls back to NVIDIA when OpenRouter is chosen and both keys are set", async () => {
    const m = await load({ OPENROUTER_API_KEY: "sk-or-x", NVIDIA_API_KEY: "nvapi-x" });
    expect(Array.isArray(m.claudeModel)).toBe(true);
    expect(ids(m.claudeModel)).toEqual(["anthropic/claude-sonnet-5", "nvidia/nemotron-3-super-120b-a12b"]);
    expect(ids(m.claudeModelNoThinking)).toHaveLength(2);
    expect(ids(m.fastModel)).toEqual(["anthropic/claude-haiku-4.5", "nvidia/nemotron-3-super-120b-a12b"]);
  });

  it("falls back the other way when NVIDIA is chosen", async () => {
    const m = await load({ LLM_PROVIDER: "nvidia", OPENROUTER_API_KEY: "sk-or-x", NVIDIA_API_KEY: "nvapi-x" });
    expect(ids(m.claudeModel)).toEqual(["nvidia/nemotron-3-super-120b-a12b", "anthropic/claude-sonnet-5"]);
  });

  it("is a single model when only one provider has a key", async () => {
    const m = await load({ OPENROUTER_API_KEY: "sk-or-x" });
    expect(Array.isArray(m.claudeModel)).toBe(false);
  });

  it("applies a model override to the chosen provider only", async () => {
    const m = await load({ OPENROUTER_API_KEY: "sk-or-x", NVIDIA_API_KEY: "nvapi-x", LLM_MODEL_ID: "anthropic/claude-opus-5-5" });
    expect(ids(m.claudeModel)).toEqual(["anthropic/claude-opus-5-5", "nvidia/nemotron-3-super-120b-a12b"]);
  });
});
