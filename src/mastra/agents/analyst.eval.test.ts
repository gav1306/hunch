import { describe, expect, test } from "vitest";
import { narrateVerdict } from "@/mastra/agents/analyst";

const hasKey = Boolean(process.env.OPENROUTER_API_KEY);

/**
 * Analyst faithfulness eval: the narrative must reflect the decided category and
 * never contradict the given number. Self-skips without an OpenRouter key.
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

  /**
   * The narrative sits directly under a headline that refuses to say whether a
   * change was good — "Bugs found today went up", never "It helped". If the
   * prose calls the same move an improvement, the card contradicts itself.
   *
   * Both cases here are `helped`, which only means the outcome rose. For bugs
   * and for spending, rising is the bad news; the Analyst is not told that, and
   * must not guess.
   *
   * Honest about its strength: reverting the instructions' no-valence rule does
   * NOT fail this test — three runs, all green. The prose was already neutral
   * without being told; the "It helped" bug lived in the headline and the badge,
   * not here. This is a tripwire against a future prompt that reintroduces
   * judgement, not evidence that the current wording is what prevents it.
   */
  test.each([
    {
      name: "a rising bug count",
      statement: "Skipping my morning walk makes my code buggier.",
      outcomeMetric: "number of bugs found in code review that day",
      pEffect: 0.96,
      effect: 2.4,
      ci: [0.8, 4.0] as [number, number],
    },
    {
      name: "rising spend",
      statement: "Shopping while hungry makes me spend more money.",
      outcomeMetric: "total dollars spent per shopping trip",
      pEffect: 0.95,
      effect: 12.5,
      ci: [3.1, 21.9] as [number, number],
    },
  ])("passes no judgement on $name", async ({ statement, outcomeMetric, pEffect, effect, ci }) => {
    const narrative = await narrateVerdict({
      category: "helped",
      pEffect,
      effect,
      ci,
      statement,
      outcomeMetric,
    });
    expect(narrative.length).toBeGreaterThan(0);
    // "positive"/"negative" are allowed: they describe the sign of the effect,
    // not whether the news is welcome.
    expect(narrative.toLowerCase()).not.toMatch(
      /helped|improve|better|worse|beneficial|good news|bad news|setback|win\b/,
    );
    // It still has to say which way the number went.
    expect(narrative.toLowerCase()).toMatch(/up|more|higher|increase|rose/);
  }, 60_000);
});
