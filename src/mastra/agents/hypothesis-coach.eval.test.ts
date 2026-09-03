import { describe, expect, test } from "vitest";
import { sharpenHunch } from "@/mastra/agents/hypothesis-coach";
import { sharpenedHypothesisSchema } from "@/lib/schemas/hypothesis";

const hasKey = Boolean(process.env.OPENROUTER_API_KEY);

/**
 * Hypothesis-quality eval (RESEARCH §5): the coach must turn a vague hunch
 * into a hypothesis that is well-formed, falsifiable, and measurable.
 * Self-skips without an OpenRouter key (e.g. CI).
 */
describe.skipIf(!hasKey)("Hypothesis Coach quality", () => {
  const hunches = [
    "i think coffee in the afternoon wrecks my sleep",
    "standing desk seems to help me focus",
  ];

  test.for(hunches)(
    "sharpens %s into a falsifiable, measurable hypothesis",
    async (rawText) => {
      const h = await sharpenHunch(rawText);

      // Well-formed: satisfies the schema contract.
      expect(sharpenedHypothesisSchema.safeParse(h).success).toBe(true);

      // Falsifiable: a claim, not a question, with substance.
      expect(h.statement.trim().endsWith("?")).toBe(false);
      expect(h.statement.split(/\s+/).length).toBeGreaterThanOrEqual(4);

      // Measurable: a real outcome metric, not a stub.
      expect(h.outcomeMetric.split(/\s+/).length).toBeGreaterThanOrEqual(2);
    },
  );

  test.each([
    "I spend more money when I shop hungry",
    "my knee hurts after playing basketball on Sundays",
    "I get carsick on long drives",
  ])("phrases %s so it can be logged every day", async (raw) => {
    const h = await sharpenHunch(raw);
    // Per-event phrasing is the bug: a trial is measured in days, so an outcome
    // that only exists on some of them leaves the rest blank, the adherence
    // strip calls them missed, and a perfectly run trial ends with too few
    // readings to say anything.
    expect(h.outcomeMetric).not.toMatch(
      /per (shopping )?trip|each run|per run|per meal|every time|per session|per drive|per game/i,
    );
    // And it should say when, so "every day" is unambiguous.
    expect(h.outcomeMetric.toLowerCase()).toMatch(
      /today|each day|daily|each morning|each evening|day's end|per day/,
    );
  }, 120_000);
});
