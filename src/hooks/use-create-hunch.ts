"use client";

import { useMutation } from "@tanstack/react-query";
import type { SharpenedHypothesis } from "@/lib/schemas/hypothesis";
import type { Prior } from "@/lib/schemas/prior";
import type { ClarifyingAnswer } from "@/lib/schemas/clarify";
import type { Parameter } from "@/lib/schemas/parameter";

/** A persisted hunch with its sharpened hypothesis + any recalled priors. */
export type HunchWithHypothesis = {
  id: string;
  rawText: string;
  status: string;
  hypothesis: SharpenedHypothesis & { id: string };
  /** The proposed parameter set the confirm gate will edit. */
  parameters: Parameter[];
  priors: Prior[];
};

async function postHunch(
  input: { rawText: string; answers: ClarifyingAnswer[] },
  resumeId?: string,
): Promise<HunchWithHypothesis> {
  const res = await fetch(resumeId ? `/api/hunch/${resumeId}/sharpen` : "/api/hunch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  // Tolerate a non-JSON / empty body (e.g. an unhandled 5xx) instead of letting
  // res.json() throw a raw "Unexpected end of JSON input" at the UI.
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.hunch) {
    throw new Error(body?.error ?? "Something went wrong sharpening your hunch.");
  }
  return { ...body.hunch, priors: body.priors ?? [] } as HunchWithHypothesis;
}

/**
 * Drop a free-text hunch and get back its sharpened hypothesis.
 *
 * With `resumeId`, the same flow re-sharpens that hunch in place instead of
 * creating another one — so "redo" keeps the user's original text and doesn't
 * strand the old hunch in "Finish setting up" forever.
 */
export function useCreateHunch(resumeId?: string) {
  return useMutation({
    mutationFn: (input: { rawText: string; answers: ClarifyingAnswer[] }) =>
      postHunch(input, resumeId),
  });
}
