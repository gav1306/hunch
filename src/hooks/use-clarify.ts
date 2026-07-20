"use client";

import { useMutation } from "@tanstack/react-query";
import type { ClarifyingQuestion } from "@/lib/schemas/clarify";

async function postClarify(rawText: string): Promise<ClarifyingQuestion[]> {
  const res = await fetch("/api/hunch/clarify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawText }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(body?.questions)) {
    throw new Error(body?.error ?? "Couldn't think of questions right now.");
  }
  return body.questions as ClarifyingQuestion[];
}

/** Ask the coach's clarifying questions for a raw hunch. */
export function useClarify() {
  return useMutation({ mutationFn: postClarify });
}
