import { describe, expect, test } from "vitest";
import { designProtocolShape } from "@/mastra/agents/protocol-designer";
import { detectConfounders } from "@/mastra/tools/confounder-detection";
import { estimateTrialLength } from "@/mastra/tools/power-analysis";
import { protocolDesignSchema } from "@/lib/schemas/protocol";

const hasKey = Boolean(process.env.OPENROUTER_API_KEY);

/**
 * Protocol-quality eval: the designer must emit a valid ABA design that honours
 * the deterministic trial length and carries the confounder controls.
 * Self-skips without an OpenRouter key (e.g. CI).
 */
describe.skipIf(!hasKey)("Protocol Designer quality", () => {
  test("produces a valid ABA design honouring the given inputs", async () => {
    const power = estimateTrialLength({ outcomeType: "continuous" });
    const confounders = detectConfounders(["afternoon caffeine", "stress"]);

    const design = await designProtocolShape({
      statement: "Cutting caffeine after noon increases nightly sleep duration.",
      outcomeMetric: "hours of sleep from a tracker",
      outcomeType: "continuous",
      confounders,
      power,
    });

    expect(protocolDesignSchema.safeParse(design).success).toBe(true);

    // ABA shape.
    expect(design.phases.map((p) => p.label)).toEqual(["A", "B", "A"]);
    expect(design.phases.map((p) => p.kind)).toEqual(["baseline", "intervention", "baseline"]);

    // Honours the deterministic trial length.
    for (const phase of design.phases) {
      expect(phase.days).toBe(power.minDaysPerPhase);
    }

    // Carries the controls.
    expect(design.controls.length).toBeGreaterThanOrEqual(confounders.length);

    // The model wrote the phase copy — the plain fallbacks mean it didn't.
    expect(design.phases[0].name).not.toBe("Baseline");
    expect(design.phases[1].name).not.toBe("Intervention");
    expect(design.phases[2].name).not.toBe("Baseline");
    // "caffeinated" is as good as "caffeine" — match the stem, not the word.
    expect(design.phases[1].action.toLowerCase()).toMatch(/caffein|coffee/);
    expect(design.washoutDays).toBeGreaterThanOrEqual(0);
    expect(design.washoutDays).toBeLessThanOrEqual(3);
  }, 60_000);
});
