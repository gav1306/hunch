"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

async function deleteHunch(hunchId: string): Promise<void> {
  const res = await fetch(`/api/hunch/${hunchId}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Couldn't delete this hunch.");
  }
}

/** Abandon a hunch. Its protocol, parameters, check-ins and verdict go with it. */
export function useDeleteHunch(hunchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteHunch(hunchId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["belief", hunchId] });
      queryClient.removeQueries({ queryKey: ["hunch-info", hunchId] });
    },
  });
}
