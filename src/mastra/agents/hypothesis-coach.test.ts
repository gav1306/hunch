import { describe, expect, it, vi } from "vitest";

// buildSharpenPrompt is pure, but importing the module constructs `new Agent(...)`
// at load time — stub the Agent + model so no live client is built.
vi.mock("@mastra/core/agent", () => ({
  Agent: class {
    generate = vi.fn();
  },
}));
vi.mock("@/mastra/model", () => ({ claudeModel: {} }));

import { buildSharpenPrompt } from "@/mastra/agents/hypothesis-coach";

describe("buildSharpenPrompt", () => {
  it("includes the raw hunch", () => {
    const p = buildSharpenPrompt("coffee wrecks sleep", [], []);
    expect(p).toContain("coffee wrecks sleep");
  });

  it("folds clarifying answers in as ground truth", () => {
    const p = buildSharpenPrompt("coffee wrecks sleep", [], [
      { id: "measure", prompt: "How would you track it?", answer: "sleep score" },
    ]);
    expect(p).toContain("sleep score");
    expect(p).toContain("How would you track it?");
  });

  it("omits the answers block when there are none", () => {
    const p = buildSharpenPrompt("x", [], []);
    expect(p.toLowerCase()).not.toContain("ground truth");
  });
});

describe("buildSharpenPrompt for a log", () => {
  it("tells the coach to write something to watch for, not something to do", () => {
    const prompt = buildSharpenPrompt("skip my antidepressant", [], [], true);
    expect(prompt).toContain("LOG, not a trial");
    expect(prompt).toContain("WATCH FOR");
  });

  it("says nothing of the sort for an ordinary trial", () => {
    const prompt = buildSharpenPrompt("coffee wrecks my sleep", [], []);
    expect(prompt).not.toContain("LOG, not a trial");
  });

  it("still carries the raw text either way", () => {
    expect(buildSharpenPrompt("coffee wrecks my sleep", [], [], true)).toContain(
      "coffee wrecks my sleep",
    );
  });
});
