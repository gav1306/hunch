import { describe, expect, test } from "vitest";
import { sharpenHunch, streamSharpenHunch } from "@/mastra/agents/hypothesis-coach";
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

  test.each([
    "i think skipping coffee after lunch helps me sleep",
    "magnesium before bed settles me down",
  ])("keeps %s schedulable", async (raw) => {
    const h = await sharpenHunch(raw);
    expect(h.schedulable).toBe(true);
  }, 120_000);

  test.each([
    "my knee hurts after playing basketball",
    "the sauna wrecks my sleep that night",
  ])("marks %s as opportunity-dependent, with an exposure", async (raw) => {
    const h = await sharpenHunch(raw);
    expect(h.schedulable).toBe(false);
    expect(h.exposure?.type).toBe("binary");
    expect(h.exposure?.label.trim().length ?? 0).toBeGreaterThan(2);
    // The exposure is the change, not the outcome restated.
    expect(h.exposure?.label.toLowerCase()).not.toBe(h.outcomeMetric.toLowerCase());
  }, 120_000);
});

describe.skipIf(!hasKey)("Hypothesis Coach, streamed", () => {
  test("streams a hypothesis of the same shape the generated path returns", async () => {
    const partials: Array<Record<string, unknown>> = [];
    const h = await streamSharpenHunch(
      "i think coffee in the afternoon wrecks my sleep",
      [],
      [],
      false,
      (p) => partials.push(p as Record<string, unknown>),
    );

    // Same contract as the generated path — this is the guard against the two
    // drifting apart, since they share the prompt and the schema.
    expect(sharpenedHypothesisSchema.safeParse(h).success).toBe(true);
    expect(h.statement.trim().endsWith("?")).toBe(false);
    expect(h.outcomeMetric.split(/\s+/).length).toBeGreaterThanOrEqual(2);

    // It actually streamed — the first-key and last-partial assertions below
    // are what guard the contract. A short hypothesis can legitimately arrive
    // in one frame, so the partial count is a property of the provider's
    // chunking, not of the Coach, and isn't asserted on here.
    expect(partials.length).toBeGreaterThanOrEqual(1);
    // The first partial can legitimately be `{}` — a frame arrives before any field
    // name has. What matters is which field lands first: the form types the
    // statement out, so the schema's order putting it first is load-bearing.
    const firstWithFields = partials.find((p) => Object.keys(p).length > 0);
    expect(firstWithFields).toBeDefined();
    expect(Object.keys(firstWithFields!)[0]).toBe("statement");

    // The last partial is the finished object, so the text the user watched
    // appear is the text they end up with.
    expect(partials.at(-1)!.statement).toBe(h.statement);
  });
});
