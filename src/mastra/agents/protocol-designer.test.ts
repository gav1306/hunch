import { describe, it, expect, vi, beforeEach } from "vitest";

// Importing the module constructs `new Agent(...)` at load time — stub the
// Agent + model so no live client is built and `generate` is ours to script.
vi.mock("@mastra/core/agent", () => ({
  Agent: class {
    generate = vi.fn();
  },
}));
vi.mock("@/mastra/model", () => ({ claudeModel: {} }));

import {
  composeInstructions,
  designProtocolShape,
  fillPhaseDefaults,
  protocolDesigner,
} from "./protocol-designer";
import {
  OBSERVATION_DAYS,
  observationalDesign,
  protocolDesignSchema,
  type PowerInfo,
  type ProtocolPhase,
} from "@/lib/schemas/protocol";

describe("composeInstructions", () => {
  const design = {
    phases: [
      { label: "A" as const, kind: "baseline" as const, days: 7, name: "Normal coffee", action: "Keep your usual coffee." },
      { label: "B" as const, kind: "intervention" as const, days: 7, name: "No coffee after 2pm", action: "Skip caffeine after 2pm." },
      { label: "A" as const, kind: "baseline" as const, days: 7, name: "Normal coffee", action: "Back to usual coffee." },
    ],
    washoutDays: 2,
    controls: ["Hold caffeine constant.", "Keep sleep schedule steady."],
  };

  it("produces a non-empty string that satisfies the schema's instructions field", () => {
    const instructions = composeInstructions(design, "sleep quality");
    expect(instructions.length).toBeGreaterThan(0);
    // The exact failure mode from the 500: instructions must parse.
    expect(() =>
      protocolDesignSchema.parse({ ...design, instructions }),
    ).not.toThrow();
  });

  it("references each phase, the washout, and every control", () => {
    const out = composeInstructions(design, "sleep quality");
    expect(out).toContain("Phase 1");
    expect(out).toContain("Phase 3");
    expect(out).toContain("sleep quality");
    expect(out).toContain("2-day washout");
    for (const c of design.controls) expect(out).toContain(c);
  });

  it("omits the washout line when washoutDays is 0", () => {
    const out = composeInstructions({ ...design, washoutDays: 0 }, "mood");
    expect(out).not.toContain("washout");
  });

  it("leads each phase with its human name and action", () => {
    const out = composeInstructions(design, "sleep quality");
    expect(out).toContain("No coffee after 2pm");
    expect(out).toContain("Skip caffeine after 2pm.");
  });
});

describe("fillPhaseDefaults", () => {
  it("fills name/action when the model omits them", () => {
    const phases = fillPhaseDefaults(
      [
        { label: "A", kind: "baseline", days: 7 },
        { label: "B", kind: "intervention", days: 7 },
      ],
      "sleep quality",
    );
    expect(phases[0].name.length).toBeGreaterThan(0);
    expect(phases[0].action.length).toBeGreaterThan(0);
    expect(phases[1].name.toLowerCase()).toContain("intervention");
  });

  it("keeps model-provided name/action", () => {
    const phases = fillPhaseDefaults(
      [{ label: "B", kind: "intervention", days: 7, name: "No coffee", action: "skip caffeine" }],
      "sleep",
    );
    expect(phases[0].name).toBe("No coffee");
  });
});

describe("designProtocolShape", () => {
  const generate = protocolDesigner.generate as unknown as ReturnType<typeof vi.fn>;
  const power: PowerInfo = {
    minDaysPerPhase: 7,
    effectSize: "medium",
    rationale: "a medium effect on a continuous outcome",
  };
  const threePhases: ProtocolPhase[] = [
    { label: "A", kind: "baseline", days: 7, name: "Normal weeks", action: "Nothing changes." },
    { label: "B", kind: "intervention", days: 7, name: "Play basketball", action: "Play daily." },
    { label: "A", kind: "baseline", days: 7, name: "Normal weeks", action: "Nothing changes." },
  ];
  const input = {
    statement: "Playing basketball improves my sleep quality.",
    outcomeMetric: "sleep quality",
    outcomeType: "continuous" as const,
    confounders: [
      {
        name: "caffeine",
        type: "behavioral" as const,
        expectedDirection: "unknown" as const,
        control: "Hold caffeine constant.",
      },
    ],
    power,
  };

  beforeEach(() => {
    generate.mockReset();
  });

  const lastPrompt = () => generate.mock.calls[generate.mock.calls.length - 1][0] as string;

  describe("observational", () => {
    const observational = {
      ...input,
      shape: "observational" as const,
      exposureLabel: "played basketball",
    };
    const deterministic = observationalDesign("sleep quality", "played basketball");

    it("takes phases, washoutDays and shape out of the model's hands", async () => {
      // The model ignored the branch and designed an ABA trial anyway.
      generate.mockResolvedValue({
        object: {
          phases: threePhases,
          washoutDays: 2,
          controls: ["Hold caffeine constant."],
          instructions: "Run three phases.",
          shape: "phased",
        },
      });

      const design = await designProtocolShape(observational);

      expect(design.phases).toEqual(deterministic.phases);
      expect(design.washoutDays).toBe(0);
      expect(design.shape).toBe("observational");
    });

    it("keeps the model's controls and instructions", async () => {
      generate.mockResolvedValue({
        object: {
          phases: threePhases,
          washoutDays: 2,
          controls: ["Hold caffeine constant.", "Keep bedtime steady."],
          instructions: "Live normally and answer both questions each evening.",
        },
      });

      const design = await designProtocolShape(observational);

      expect(design.controls).toEqual(["Hold caffeine constant.", "Keep bedtime steady."]);
      expect(design.instructions).toBe("Live normally and answer both questions each evening.");
    });

    it("falls back to the deterministic prose when the model returns no instructions", async () => {
      // The one-phase window the prompt asks for — `phases: []` could never
      // get past the schema Mastra validates against.
      generate.mockResolvedValue({
        object: {
          phases: [
            {
              label: "A",
              kind: "baseline",
              days: OBSERVATION_DAYS,
              name: "Just live normally",
              action: "Live normally and log both questions.",
            },
          ],
          washoutDays: 0,
          controls: [],
        },
      });

      const design = await designProtocolShape(observational);

      expect(design.instructions).toBe(deterministic.instructions);
      // An empty `controls` from the model falls back to the detected controls.
      expect(design.controls).toEqual(["Hold caffeine constant."]);
    });

    it("names the exposure in the window it designs", async () => {
      generate.mockResolvedValue({ object: {} });

      const design = await designProtocolShape(observational);

      expect(design.phases[0].action).toContain("played basketball");
      expect(design.phases[0].days).toBe(21);
    });

    it("asks for the one phase its schema requires, and drops the ABA rules", async () => {
      generate.mockResolvedValue({ object: {} });

      await designProtocolShape(observational);

      const prompt = lastPrompt();
      // The schema passed to the model needs at least one phase; a prompt that
      // asked for none would have an obedient model fail validation.
      expect(prompt).toContain(
        `exactly ONE phase covering the whole window: label "A", kind "baseline", days ${OBSERVATION_DAYS}`,
      );
      expect(prompt).not.toContain("Do NOT invent phases");
      expect(prompt).not.toContain("discarded");
      expect(prompt).toContain('"played basketball"');
      expect(prompt).not.toContain("Minimum days per phase");
    });
  });

  describe("phased (unchanged)", () => {
    it("keeps the model's phases, washout, controls and instructions verbatim", async () => {
      generate.mockResolvedValue({
        object: {
          phases: threePhases,
          washoutDays: 2,
          controls: ["Hold caffeine constant."],
          instructions: "Run three phases.",
        },
      });

      const design = await designProtocolShape({ ...input, shape: "phased" });

      expect(design.phases).toEqual(threePhases);
      expect(design.washoutDays).toBe(2);
      expect(design.controls).toEqual(["Hold caffeine constant."]);
      expect(design.instructions).toBe("Run three phases.");
      expect(design.shape).toBe("phased");
    });

    it("behaves identically when no shape is given at all", async () => {
      const object = {
        phases: threePhases,
        washoutDays: 2,
        controls: ["Hold caffeine constant."],
        instructions: "Run three phases.",
      };
      generate.mockResolvedValue({ object });
      const withShape = await designProtocolShape({ ...input, shape: "phased" });
      generate.mockResolvedValue({ object });
      const withoutShape = await designProtocolShape(input);

      expect(withoutShape).toEqual(withShape);
    });

    it("still composes instructions from the phases when the model omits them", async () => {
      generate.mockResolvedValue({
        object: { phases: threePhases, washoutDays: 2, controls: ["Hold caffeine constant."] },
      });

      const design = await designProtocolShape(input);

      expect(design.instructions).toBe(
        composeInstructions(
          { phases: threePhases, washoutDays: 2, controls: ["Hold caffeine constant."] },
          "sleep quality",
        ),
      );
    });

    it("still sends the ABA rules and the deterministic phase length", async () => {
      generate.mockResolvedValue({ object: { phases: threePhases, washoutDays: 2, controls: [] } });

      await designProtocolShape(input);

      expect(lastPrompt()).toContain("Minimum days per phase (use this exact number for each phase): 7");
      expect(lastPrompt()).not.toContain("exactly ONE phase");
    });
  });
});
