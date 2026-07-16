"use client";

import { useMutation } from "@tanstack/react-query";
import type { SharpenedHypothesis } from "@/lib/schemas/hypothesis";
import type { Prior } from "@/lib/schemas/prior";

/** A persisted hunch with its sharpened hypothesis + any recalled priors. */
export type HunchWithHypothesis = {
  id: string;
  rawText: string;
  status: string;
  hypothesis: SharpenedHypothesis & { id: string };
  priors: Prior[];
};

async function postHunch(rawText: string): Promise<HunchWithHypothesis> {
  const res = await fetch("/api/hunch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawText }),
  });

  // Tolerate a non-JSON / empty body (e.g. an unhandled 5xx) instead of letting
  // res.json() throw a raw "Unexpected end of JSON input" at the UI.
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.hunch) {
    throw new Error(body?.error ?? "Something went wrong sharpening your hunch.");
  }
  return { ...body.hunch, priors: body.priors ?? [] } as HunchWithHypothesis;
}

/** Drop a free-text hunch and get back its sharpened hypothesis. */
export function useCreateHunch() {
  return useMutation({ mutationFn: postHunch });
}
