"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Belief } from "@/lib/schemas/belief";

/** One reading the user is submitting for one parameter. */
export type CheckInValueInput = { parameterId: string; value: number };

export type CheckInResponse = {
  checkIn: { id: string; phase: string };
  belief: Belief;
};

async function postCheckIn(
  hunchId: string,
  values: CheckInValueInput[],
): Promise<CheckInResponse> {
  const res = await fetch(`/api/hunch/${hunchId}/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? "Could not log your check-in.");
  }
  return body as CheckInResponse;
}

/** Log today's readings; refreshes the belief meter on success. */
export function useCheckIn(hunchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: CheckInValueInput[]) => postCheckIn(hunchId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["belief", hunchId] });
    },
  });
}
