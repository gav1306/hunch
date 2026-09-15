import { readEdges } from "@/lib/memory/causal-graph";
import { selectCandidatePriors, toPriors } from "@/lib/memory/priors";
import { recallRelevantPriors } from "@/mastra/agents/memory";
import type { Prior } from "@/lib/schemas/prior";

/**
 * Recall the user's past findings relevant to a new hunch: read their edges,
 * pre-filter to candidates deterministically, let the memory agent pick the
 * genuinely related ones, and map to Prior DTOs. Throws on failure; the
 * exported wrappers decide what a failure means.
 *
 * `recalledIds` is what an earlier recall on the same text picked (clarify runs
 * first and hands them back). When given, the model is not asked again — that
 * second call cost ~2.5s on every returning user's sharpen. The ids come from
 * the browser, so they only select among this user's candidates for this text;
 * anything else is dropped by `toPriors`.
 */
async function recall(
  userId: string,
  rawText: string,
  recalledIds?: string[],
): Promise<Prior[]> {
  const edges = await readEdges(userId);
  const candidates = selectCandidatePriors(edges, rawText);
  if (candidates.length === 0) return [];

  const relatedSourceHunchIds =
    recalledIds ?? (await recallRelevantPriors(rawText, candidates)).relatedSourceHunchIds;
  return toPriors(candidates, relatedSourceHunchIds);
}

/**
 * Additive by design — any failure (no edges, agent error) yields an empty
 * list so hunch creation is never blocked.
 */
export async function recallPriors(
  userId: string,
  rawText: string,
  recalledIds?: string[],
): Promise<Prior[]> {
  try {
    return await recall(userId, rawText, recalledIds);
  } catch {
    return [];
  }
}

/**
 * Recall for a step whose result a later step reuses. `priorIds` is left unset
 * when recall failed: an empty list would tell sharpen the model found nothing,
 * and a returning user would lose their prior on one flaky call.
 */
export async function recallPriorsForReuse(
  userId: string,
  rawText: string,
): Promise<{ priors: Prior[]; priorIds?: string[] }> {
  try {
    const priors = await recall(userId, rawText);
    return { priors, priorIds: priors.map((p) => p.sourceHunchId) };
  } catch {
    return { priors: [] };
  }
}
