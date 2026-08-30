"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

async function setArchived(hunchId: string, archived: boolean): Promise<void> {
  const res = await fetch(`/api/hunch/${hunchId}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Couldn't archive this hunch.");
  }
}

/** File a concluded hunch away, or bring it back. Nothing is deleted either way. */
export function useArchiveHunch(hunchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archived: boolean) => setArchived(hunchId, archived),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hunch-info", hunchId] });
    },
  });
}
