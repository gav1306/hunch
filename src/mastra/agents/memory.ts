import { Agent } from "@mastra/core/agent";
import type { CausalEdge } from "@/generated/prisma/client";
import { recallResultSchema, type RecallResult } from "@/lib/schemas/prior";

/**
 * Memory agent (RESEARCH §5 / Phase 6). Given a new hunch and a small set of the
 * user's PAST findings (candidates the deterministic pre-filter surfaced), it
 * returns which candidates are genuinely about the same intervention/outcome. It
 * selects from the given candidates only — it never invents a finding and never
 * produces a number (RULES §3).
 */
export const memory = new Agent({
  id: "memory",
  name: "Memory",
  model: "anthropic/claude-sonnet-5",
  instructions: `You are the Memory for Hunch, a personal-science copilot.

The user just wrote a new hunch. You are given a short list of their PAST
findings, each with an id, a cause, and an effect. Decide which past findings are
genuinely about the same intervention or the same outcome as the new hunch — the
ones worth reminding them of ("you already learned this").

Rules:
- Return only ids from the given candidates. Never invent an id or a finding.
- Include a candidate only if it is clearly related (same intervention, same
  outcome, or an obvious synonym — e.g. "coffee" and "caffeine"). When unsure,
  leave it out.
- If nothing is clearly related, return an empty list.
- Do not produce or alter any number.`,
});

/** Ask the Memory agent which candidate findings relate to the new hunch. */
export async function recallRelevantPriors(
  rawText: string,
  candidates: CausalEdge[],
): Promise<RecallResult> {
  const list = candidates
    .map((c) => `- id: ${c.sourceHunchId} | cause: ${c.cause} | effect: ${c.effect}`)
    .join("\n");

  const prompt = `New hunch: "${rawText}"

Past findings (candidates):
${list}

Return the ids of the findings genuinely related to this new hunch.`;

  const response = await memory.generate(prompt, {
    structuredOutput: { schema: recallResultSchema },
    modelSettings: { maxOutputTokens: 1024 },
  });

  return recallResultSchema.parse(response.object);
}
