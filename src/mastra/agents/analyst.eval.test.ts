import { describe, expect, test } from "vitest";
import { narrateVerdict } from "@/mastra/agents/analyst";

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

/**
 * Analyst faithfulness eval: the narrative must reflect the decided category and
 * never contradict the given number. Self-skips without ANTHROPIC_API_KEY.
 */
describe.skipIf(!hasKey)("Analyst verdict quality", () => {
  test("narrates a clear positive result without contradicting it", async () => {
    const narrative = await narrateVerdict({
      category: "helped",
      pEffect: 0.97,
      effect: 1.2,
      ci: [0.4, 2.0],
      statement: "Cutting afternoon caffeine increases nightly sleep duration.",
      outcomeMetric: "hours of sleep from a tracker",
    });
    expect(narrative.length).toBeGreaterThan(0);
    // Must not claim the opposite direction.
    expect(narrative.toLowerCase()).not.toMatch(/did not help|no effect|hurt|worse|reduced your sleep/);
  }, 60_000);

  test("frames an inconclusive result as legitimate, not a failure", async () => {
    const narrative = await narrateVerdict({
      category: "inconclusive_no_effect",
      pEffect: 0.55,
      effect: 0.1,
      ci: [-0.6, 0.8],
      statement: "A standing desk improves afternoon focus.",
      outcomeMetric: "focus rated 1-10 at day's end",
    });
    expect(narrative.length).toBeGreaterThan(0);
    // Must not overclaim a positive verdict on inconclusive data.
    expect(narrative.toLowerCase()).not.toMatch(/clearly helped|definitely|proven|strong evidence/);
  }, 60_000);
});
