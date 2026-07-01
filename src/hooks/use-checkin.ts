"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Belief } from "@/lib/schemas/belief";

export type CheckInResponse = {
  checkIn: { id: string; phase: string; value: number };
  belief: Belief;
};

async function postCheckIn(hunchId: string, value: number): Promise<CheckInResponse> {
  const res = await fetch(`/api/hunch/${hunchId}/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? "Could not log your check-in.");
  }
  return body as CheckInResponse;
}

/** Log today's check-in; refreshes the belief meter on success. */
export function useCheckIn(hunchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: number) => postCheckIn(hunchId, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["belief", hunchId] });
    },
  });
}
