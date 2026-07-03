import { db } from "@/lib/db";
import type { CausalEdge } from "@/generated/prisma/client";
import type { VerdictCategory } from "@/lib/schemas/verdict";

/** The row shape written to CausalEdge (matches db.causalEdge.create's `data`). */
export type CausalEdgeInput = {
  userId: string;
  cause: string;
  effect: string;
  direction: "increases" | "decreases" | "none";
  effectSize: number;
  confidence: number;
  sourceHunchId: string;
};

/** Map a category to its causal direction, or null if it is not a finding. */
const DIRECTION: Record<VerdictCategory, "increases" | "decreases" | "none" | null> = {
  helped: "increases",
  hurt: "decreases",
  inconclusive_no_effect: "none",
  inconclusive_insufficient: null, // not enough data — no edge
};

/**
 * Build the CausalEdge to persist for a concluded verdict, deriving every field
 * from data already stored (no LLM at write time). Returns null when the verdict
 * is not a finding (insufficient data), so the caller writes no edge.
 */
export function writeEdgeData(input: {
  category: VerdictCategory;
  effect: number;
  pEffect: number;
  statement: string;
  outcomeMetric: string;
  hunchId: string;
  userId: string;
}): CausalEdgeInput | null {
  const direction = DIRECTION[input.category];
  if (direction === null) return null;
  return {
    userId: input.userId,
    cause: input.statement,
    effect: input.outcomeMetric,
    direction,
    effectSize: input.effect,
    confidence: input.pEffect,
    sourceHunchId: input.hunchId,
  };
}

/** All of a user's stored findings, newest first. */
export function readEdges(userId: string): Promise<CausalEdge[]> {
  return db.causalEdge.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
