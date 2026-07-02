"use client";

import { useQuery } from "@tanstack/react-query";
import type { Verdict } from "@/lib/schemas/verdict";

export type VerdictResponse = { verdict: Verdict };

async function fetchVerdict(hunchId: string): Promise<VerdictResponse> {
  const res = await fetch(`/api/hunch/${hunchId}/verdict`);
  // An uncaught server throw can return a non-JSON body; don't let that parse
  // error mask the real HTTP status.
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? "Could not load your verdict.");
  }
  return body as VerdictResponse;
}

/** The frozen verdict for a concluded hunch. Generated server-side on first read. */
export function useVerdict(hunchId: string) {
  return useQuery({
    queryKey: ["verdict", hunchId],
    queryFn: () => fetchVerdict(hunchId),
  });
}
