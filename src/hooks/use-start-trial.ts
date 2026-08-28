"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { StartOn } from "@/lib/schedule";

export type StartTrialResponse = {
  startedAt: string;
  status: "running";
  /** The hour reminders now go out at, or null if the user has them off. */
  remindersOn: number | null;
};

/** The browser's own zone, when it will tell us. */
function browserZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

async function postStart(hunchId: string, startOn: StartOn): Promise<StartTrialResponse> {
  const res = await fetch(`/api/hunch/${hunchId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // The zone rides along with the start: the user chose "8pm", and which 8pm
    // that is should not be a question they have to answer.
    body: JSON.stringify({ startOn, timeZone: browserZone() }),
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
