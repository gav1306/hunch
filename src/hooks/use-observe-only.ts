"use client";

import { useMutation } from "@tanstack/react-query";

/**
 * Turn a sharpened hunch into a log the app keeps rather than a trial it
 * schedules. This is the door out of a refusal — see
 * `src/app/api/hunch/[id]/observe/route.ts`.
 */
export function useObserveOnly(hunchId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/hunch/${hunchId}/observe`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Couldn't set that up as a log.");
      }
      return body as { protocol: { id: string; safetyState: string } };
    },
  });
}
