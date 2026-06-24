"use client";

import { useMutation } from "@tanstack/react-query";
import type { SharpenedHypothesis } from "@/lib/schemas/hypothesis";

/** A persisted hunch with its sharpened hypothesis, as returned by the API. */
export type HunchWithHypothesis = {
  id: string;
  rawText: string;
  status: string;
  hypothesis: SharpenedHypothesis & { id: string };
};

async function postHunch(rawText: string): Promise<HunchWithHypothesis> {
  const res = await fetch("/api/hunch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawText }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? "Something went wrong sharpening your hunch.");
  }
  return body.hunch as HunchWithHypothesis;
}

/** Drop a free-text hunch and get back its sharpened hypothesis. */
export function useCreateHunch() {
  return useMutation({ mutationFn: postHunch });
}
