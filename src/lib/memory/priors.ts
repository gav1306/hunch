import type { CausalEdge } from "@/generated/prisma/client";
import { priorSchema, type Prior } from "@/lib/schemas/prior";

/** Words too common to signal topical overlap. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "my", "me",
  "i", "is", "it", "does", "do", "did", "your", "with", "at", "by",
  "this", "that", "these", "those", "was", "were", "are", "am", "be", "been",
  "have", "has", "had", "if", "as", "so", "than", "then", "but", "not", "no",
]);

/** Lowercase word tokens, stop-words removed, length >= 3. */
function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return new Set(words.filter((w) => w.length >= 3 && !STOP_WORDS.has(w)));
}

/** Count of shared meaningful tokens between the hunch and an edge. */
function overlapScore(hunchTokens: Set<string>, edge: CausalEdge): number {
  const edgeTokens = tokenize(`${edge.cause} ${edge.effect}`);
  let score = 0;
  for (const t of edgeTokens) if (hunchTokens.has(t)) score++;
  return score;
}

/**
 * Deterministic pre-filter: the user's edges that share meaningful keywords with
 * the new hunch, most-overlapping first, capped at `limit`. Pure — no LLM, no DB.
 * The LLM relevance step (memory agent) refines this candidate set; this layer
 * only has to be cheap and recall-generous.
 */
export function selectCandidatePriors(
  edges: CausalEdge[],
  rawText: string,
  limit = 5,
): CausalEdge[] {
  const hunchTokens = tokenize(rawText);
  return edges
    .filter((e) => e.sourceHunchId !== null)
    .map((e) => ({ edge: e, score: overlapScore(hunchTokens, e) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.edge);
}

/**
 * Map the agent-selected candidates to Prior DTOs. Only candidates whose
 * sourceHunchId the agent actually returned survive, so a hallucinated id (one
 * never offered as a candidate) is dropped rather than trusted. Each mapped row
 * is validated against `priorSchema` at this boundary: a legacy/corrupt edge
 * (e.g. a non-canonical `direction`) is dropped rather than flowing untyped to
 * the client.
 */
export function toPriors(
  candidates: CausalEdge[],
  relatedSourceHunchIds: string[],
): Prior[] {
  const selected = new Set(relatedSourceHunchIds);
  return candidates
    .filter((e) => e.sourceHunchId !== null && selected.has(e.sourceHunchId))
    .map((e) => ({
      cause: e.cause,
      effect: e.effect,
      direction: e.direction,
      effectSize: e.effectSize ?? 0,
      confidence: e.confidence ?? 0,
      sourceHunchId: e.sourceHunchId,
    }))
    .map((p) => priorSchema.safeParse(p))
    .filter((r) => r.success)
    .map((r) => r.data);
}
