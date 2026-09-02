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

/**
 * The app declining to plan this one, rather than failing to.
 *
 * Carried as its own error type so the form can render the refusal and its two
 * doors instead of a red line — a wall with no way past it is why people leave.
 */
export class BlockedHunchError extends Error {
  readonly blocked: string;
  constructor(blocked: string, message: string) {
    super(message);
    this.name = "BlockedHunchError";
    this.blocked = blocked;
  }
}

async function postHunch(
  input: { rawText: string; answers: ClarifyingAnswer[]; observeOnly?: boolean },
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
  if (res.status === 422 && body?.blocked) {
    throw new BlockedHunchError(body.blocked as string, body.error as string);
  }
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
    mutationFn: (input: {
      rawText: string;
      answers: ClarifyingAnswer[];
      observeOnly?: boolean;
    }) => postHunch(input, resumeId),
  });
}
