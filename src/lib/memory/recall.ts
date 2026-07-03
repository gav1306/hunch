import { readEdges } from "@/lib/memory/causal-graph";
import { selectCandidatePriors, toPriors } from "@/lib/memory/priors";
import { recallRelevantPriors } from "@/mastra/agents/memory";
import type { Prior } from "@/lib/schemas/prior";

/**
 * Recall the user's past findings relevant to a new hunch: read their edges,
 * pre-filter to candidates deterministically, let the memory agent pick the
 * genuinely related ones, and map to Prior DTOs. Additive by design — any
 * failure (no edges, agent error) yields an empty list so hunch creation is
 * never blocked.
 */
export async function recallPriors(userId: string, rawText: string): Promise<Prior[]> {
  try {
    const edges = await readEdges(userId);
    const candidates = selectCandidatePriors(edges, rawText);
    if (candidates.length === 0) return [];

    const { relatedSourceHunchIds } = await recallRelevantPriors(rawText, candidates);
    return toPriors(candidates, relatedSourceHunchIds);
  } catch {
    return [];
  }
}
