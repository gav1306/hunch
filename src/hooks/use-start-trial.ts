"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { StartOn } from "@/lib/schedule";

export type StartTrialResponse = { startedAt: string; status: "running" };

async function postStart(hunchId: string, startOn: StartOn): Promise<StartTrialResponse> {
  const res = await fetch(`/api/hunch/${hunchId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ startOn }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? "Could not start your trial.");
  }
  return body as StartTrialResponse;
}

/**
 * Begin a designed trial, anchoring day 1 on today or tomorrow.
 *
 * Separate from `useDesignProtocol` on purpose: designing used to start the
 * trial as a side effect, so the clock ran while the user was still reading.
 */
export function useStartTrial(hunchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (startOn: StartOn) => postStart(hunchId, startOn),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["belief", hunchId] });
      queryClient.invalidateQueries({ queryKey: ["hunch", hunchId] });
    },
  });
}
