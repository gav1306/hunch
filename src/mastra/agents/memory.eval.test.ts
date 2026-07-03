import { describe, expect, test } from "vitest";
import { recallRelevantPriors } from "@/mastra/agents/memory";
import type { CausalEdge } from "@/generated/prisma/client";

const hasKey = Boolean(process.env.OPENROUTER_API_KEY);

const edge = (over: Partial<CausalEdge>): CausalEdge => ({
  id: "e", userId: "u", cause: "", effect: "", direction: "increases",
  effectSize: 1, confidence: 0.9, sourceHunchId: "h", createdAt: new Date(),
  ...over,
});

const caffeine = edge({
  sourceHunchId: "h_caf",
  cause: "Cutting afternoon caffeine increases nightly sleep duration.",
  effect: "hours of sleep from a tracker",
});
const desk = edge({
  sourceHunchId: "h_desk",
  cause: "A standing desk improves afternoon focus.",
  effect: "focus rated 1-10",
});

/**
 * Memory faithfulness eval: the agent must recall a genuinely-related past
 * finding, skip unrelated ones, and only ever return ids it was given. Self-skips
 * without OPENROUTER_API_KEY.
 */
describe.skipIf(!hasKey)("Memory recall quality", () => {
  test("recalls a related past finding (coffee ~ caffeine)", async () => {
    const { relatedSourceHunchIds } = await recallRelevantPriors(
      "does drinking coffee in the afternoon wreck my sleep?",
      [caffeine, desk],
    );
    expect(relatedSourceHunchIds).toContain("h_caf");
    expect(relatedSourceHunchIds).not.toContain("h_desk");
  }, 60_000);

  test("recalls nothing for an unrelated hunch and never invents ids", async () => {
    const { relatedSourceHunchIds } = await recallRelevantPriors(
      "does morning stretching reduce my back pain?",
      [caffeine, desk],
    );
    // Only ever ids from the candidate set.
    for (const id of relatedSourceHunchIds) {
      expect(["h_caf", "h_desk"]).toContain(id);
    }
    expect(relatedSourceHunchIds).not.toContain("h_caf");
  }, 60_000);
});
