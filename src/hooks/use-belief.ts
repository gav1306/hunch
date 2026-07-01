"use client";

import { useQuery } from "@tanstack/react-query";
import type { Belief } from "@/lib/schemas/belief";
import type { PhaseStatus } from "@/lib/schedule";

export type BeliefResponse = {
  belief: Belief;
  checkIns: { phase: string; value: number; loggedAt: string }[];
  schedule: PhaseStatus | null;
};

async function fetchBelief(hunchId: string): Promise<BeliefResponse> {
  const res = await fetch(`/api/hunch/${hunchId}/belief`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? "Could not load your belief meter.");
  }
  return body as BeliefResponse;
}

/** Live belief for a hunch. Recomputed server-side on every fetch. */
export function useBelief(hunchId: string) {
  return useQuery({
    queryKey: ["belief", hunchId],
    queryFn: () => fetchBelief(hunchId),
  });
}
