"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Belief } from "@/lib/schemas/belief";

/** One reading the user is submitting for one parameter. */
export type CheckInValueInput = { parameterId: string; value: number };

/**
 * The mid-trial safety net's output for a reading the app accepted. Never
 * stored — see src/lib/safety/reading-flags.ts.
 */
export type ReadingFlagDto = {
  kind: "outlier" | "limit";
  message: string;
  source?: string;
  parameterId: string;
  label: string;
};

export type CheckInResponse = {
  checkIn: { id: string; phase: string };
  belief: Belief;
  flags?: ReadingFlagDto[];
};

/** One submission: the readings, and which day they are for. */
export type CheckInSubmission = {
  values: CheckInValueInput[];
  /** ISO timestamp of an earlier day being corrected. Omitted means today. */
  loggedOn?: string;
};

async function postCheckIn(
  hunchId: string,
  { values, loggedOn }: CheckInSubmission,
): Promise<CheckInResponse> {
  const res = await fetch(`/api/hunch/${hunchId}/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values, ...(loggedOn ? { loggedOn } : {}) }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? "Could not log your check-in.");
  }
  return body as CheckInResponse;
}

/** Log a day's readings; refreshes the belief meter on success. */
export function useCheckIn(hunchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (submission: CheckInSubmission) => postCheckIn(hunchId, submission),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["belief", hunchId] });
    },
  });
}
