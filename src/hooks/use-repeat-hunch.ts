"use client";

import { useMutation } from "@tanstack/react-query";

async function repeatHunch(hunchId: string): Promise<{ id: string }> {
  const res = await fetch(`/api/hunch/${hunchId}/repeat`, { method: "POST" });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? "Couldn't set up a repeat of this experiment.");
  }
  return body as { id: string };
}

/** Clone a concluded experiment into a fresh, unstarted one with the same plan. */
export function useRepeatHunch(hunchId: string) {
  return useMutation({ mutationFn: () => repeatHunch(hunchId) });
}
