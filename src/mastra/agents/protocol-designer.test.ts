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
  phaseCopySchema,
  protocolDesigner,
} from "./protocol-designer";
import {
  OBSERVATION_DAYS,
  observationalDesign,
  protocolDesignSchema,
  type PowerInfo,
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
  const copy = {
    baselineName: "Normal evenings",
    baselineAction: "Keep your usual evenings.",
    interventionName: "Basketball after work",
    interventionAction: "Play basketball after work each day.",
    returnName: "Back to normal evenings",
    returnAction: "Stop the basketball and log your last week before the verdict.",
    washoutDays: 2,
  };

  beforeEach(() => {
    generate.mockReset();
  });

  const lastCall = () => generate.mock.calls[generate.mock.calls.length - 1];

  describe("observational", () => {
    const observational = {
      ...input,
      shape: "observational" as const,
      exposureLabel: "played basketball",
    };
    const deterministic = observationalDesign("sleep quality", "played basketball");

    it("designs the window without asking the model", async () => {
      // Everything the model used to write here was either overwritten
      // (phases, washout, shape) or copied from its input (controls); the
      // instructions are read by the safety reviewer and shown nowhere.
      const design = await designProtocolShape(observational);

      expect(generate).not.toHaveBeenCalled();
      expect(design.phases).toEqual(deterministic.phases);
      expect(design.washoutDays).toBe(0);
      expect(design.shape).toBe("observational");
      expect(design.instructions).toBe(deterministic.instructions);
    });

    it("carries the detected confounder controls", async () => {
      const design = await designProtocolShape(observational);

      expect(design.controls).toEqual(["Hold caffeine constant."]);
    });

    it("names the exposure in the window it designs", async () => {
      const design = await designProtocolShape(observational);

      expect(design.phases[0].action).toContain("played basketball");
      expect(design.phases[0].days).toBe(OBSERVATION_DAYS);
    });
  });

  describe("phased", () => {
    it("builds A, B, A at the deterministic length from the model's three phase copies", async () => {
      generate.mockResolvedValue({ object: copy });

      const design = await designProtocolShape(input);

      expect(design.phases).toEqual([
        { label: "A", kind: "baseline", days: 7, name: "Normal evenings", action: "Keep your usual evenings." },
        { label: "B", kind: "intervention", days: 7, name: "Basketball after work", action: "Play basketball after work each day." },
        {
          label: "A",
          kind: "baseline",
          days: 7,
          name: "Back to normal evenings",
          action: "Stop the basketball and log your last week before the verdict.",
        },
      ]);
      expect(design.washoutDays).toBe(2);
      expect(design.shape).toBe("phased");
    });

    it("takes the controls from the detected confounders, not the model", async () => {
      generate.mockResolvedValue({ object: copy });

      const design = await designProtocolShape(input);

      expect(design.controls).toEqual(["Hold caffeine constant."]);
    });

    it("composes the instructions the safety reviewer reads from the phases and controls", async () => {
      generate.mockResolvedValue({ object: copy });

      const design = await designProtocolShape(input);

      expect(design.instructions).toBe(
        composeInstructions(
          { phases: design.phases, washoutDays: 2, controls: ["Hold caffeine constant."] },
          "sleep quality",
        ),
      );
      // The change itself must reach the gate.
      expect(design.instructions).toContain("Play basketball after work each day.");
    });

    it("reuses the first baseline's copy when the model skips the return phase", async () => {
      generate.mockResolvedValue({ object: { ...copy, returnName: "", returnAction: "" } });

      const design = await designProtocolShape(input);

      expect(design.phases[2]).toMatchObject({
        name: "Normal evenings",
        action: "Keep your usual evenings.",
      });
    });

    it("falls back to plain phase names when the model returns no copy", async () => {
      generate.mockResolvedValue({ object: {} });

      const design = await designProtocolShape(input);

      expect(design.phases.map((p) => p.name)).toEqual(["Baseline", "Intervention", "Baseline"]);
      expect(design.washoutDays).toBe(0);
      expect(protocolDesignSchema.safeParse(design).success).toBe(true);
    });

    it("keeps a washout the model returns out of range to 0-3 days", async () => {
      generate.mockResolvedValue({ object: { ...copy, washoutDays: 9 } });

      const design = await designProtocolShape(input);

      expect(design.washoutDays).toBe(3);
    });

    it("asks the model only for the phase copy and the washout", async () => {
      generate.mockResolvedValue({ object: copy });

      await designProtocolShape(input);

      const [prompt, options] = lastCall() as [
        string,
        { structuredOutput: { schema: unknown }; modelSettings: { maxOutputTokens: number } },
      ];
      expect(options.structuredOutput.schema).toBe(phaseCopySchema);
      expect(options.modelSettings.maxOutputTokens).toBeLessThanOrEqual(512);
      expect(prompt).not.toContain('"instructions"');
      expect(prompt).not.toContain("Minimum days per phase");
      expect(prompt).toContain(input.statement);
    });
  });
});
