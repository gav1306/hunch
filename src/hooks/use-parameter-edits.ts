"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Parameter, ParameterType } from "@/lib/schemas/parameter";

/** What the add form collects. `isPrimary` is never sent: the server sets it. */
export type TrackerInput = {
  label: string;
  type: ParameterType;
  unit?: string;
  min?: number;
  max?: number;
};

async function send(
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
): Promise<Parameter> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error ?? "That didn't save.");
  }
  return (data as { parameter: Parameter }).parameter;
}

/**
 * Both mutations invalidate the belief query, which is what carries the
 * parameter set to the check-in — so a tracker appears or disappears on the
 * logging form immediately, without a reload.
 */
export function useAddTracker(hunchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TrackerInput) =>
      send(`/api/hunch/${hunchId}/parameters`, "POST", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["belief", hunchId] }),
  });
}

export function useRetireTracker(hunchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { parameterId: string; retired: boolean }) =>
      send(`/api/hunch/${hunchId}/parameters/${input.parameterId}`, "PATCH", {
        retired: input.retired,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["belief", hunchId] }),
  });
}
