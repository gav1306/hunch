import { describe, expect, test } from "vitest";
import { sharpenHunch } from "@/mastra/agents/hypothesis-coach";
import { sharpenedHypothesisSchema } from "@/lib/schemas/hypothesis";

const hasKey = Boolean(process.env.OPENROUTER_API_KEY);

/**
 * Hypothesis-quality eval (RESEARCH §5): the coach must turn a vague hunch
 * into a hypothesis that is well-formed, falsifiable, and measurable.
 * Self-skips when OPENROUTER_API_KEY is absent (e.g. CI).
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
});
