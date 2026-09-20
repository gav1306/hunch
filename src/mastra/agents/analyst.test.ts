import { beforeEach, describe, expect, it, vi } from "vitest";

// Importing the module constructs `new Agent(...)` at load time — stub the
// Agent + model so no live client is built and `generate` is ours to script.
vi.mock("@mastra/core/agent", () => ({
  Agent: class {
    generate = vi.fn();
  },
}));
vi.mock("@/mastra/model", () => ({ claudeModel: {} }));

import { analyst, narrateVerdict } from "./analyst";

const generate = analyst.generate as unknown as ReturnType<typeof vi.fn>;
const lastPrompt = () => generate.mock.calls[generate.mock.calls.length - 1][0] as string;

const base = {
  category: "helped" as const,
  pEffect: 0.93,
  effect: 1.4,
  ci: [0.2, 2.6] as [number, number],
  statement: "Playing basketball eases my knee pain.",
  outcomeMetric: "knee pain 1-5",
};

describe("narrateVerdict", () => {
  beforeEach(() => {
    generate.mockReset();
    generate.mockResolvedValue({ object: { narrative: "Knee pain was higher on yes-days." } });
  });

  it("frames an observational trial as yes-days against no-days, naming the question", async () => {
    await narrateVerdict({ ...base, observational: true, exposureLabel: "Played basketball" });

    const prompt = lastPrompt();
    expect(prompt).toContain('said yes to "Played basketball"');
    expect(prompt).toContain("Say what went together, never what caused it");
    // The effect is exposed-minus-unexposed here; there is no intervention.
    expect(prompt).toContain("yes-days minus no-days");
    expect(prompt).not.toContain("intervention minus baseline");
    // A thin arm on this shape is a thin split, not missed logging.
    expect(prompt).toContain("do not say they didn't log enough");
  });

  it("leaves the phased prompt exactly as it was", async () => {
    await narrateVerdict({ ...base, observational: false, exposureLabel: "Played basketball" });

    expect(lastPrompt()).toBe(`Write the verdict for this concluded experiment.

Hypothesis: Playing basketball eases my knee pain.
Outcome metric: knee pain 1-5
Verdict category (decided, do not change): helped
Probability the outcome went up (P(effect > 0)): 0.93
Effect size (intervention minus baseline): 1.40
95% credible interval on the effect: [0.20, 2.60]`);
  });

  it("treats a call that says nothing about shape as phased", async () => {
    await narrateVerdict(base);

    expect(lastPrompt()).toContain("intervention minus baseline");
    expect(lastPrompt()).not.toContain("went together");
  });

  it("returns the model's narrative", async () => {
    expect(await narrateVerdict({ ...base, observational: true, exposureLabel: "Played basketball" })).toBe(
      "Knee pain was higher on yes-days.",
    );
  });
});
