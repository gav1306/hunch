"use client";

import { useQuery } from "@tanstack/react-query";
import type { Confounder, PowerInfo, ProtocolDesign } from "@/lib/schemas/protocol";

/** The protocol page's read model: the hypothesis + any already-designed protocol. */
export type HunchInfo = {
  hypothesis: { statement: string; outcomeMetric: string };
  protocol: null | {
    id: string;
    safetyState: "approved" | "refused" | "pending";
    design: ProtocolDesign;
    powerInfo: PowerInfo;
    confounders: Confounder[];
  };
};

async function fetchHunchInfo(hunchId: string): Promise<HunchInfo> {
  const res = await fetch(`/api/hunch/${hunchId}`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? "Couldn't load this hunch.");
  }
  return body as HunchInfo;
}

/** Read the hypothesis (and existing protocol, if any) for the protocol page. */
export function useHunchInfo(hunchId: string) {
  return useQuery({
    queryKey: ["hunch-info", hunchId],
    queryFn: () => fetchHunchInfo(hunchId),
  });
}
