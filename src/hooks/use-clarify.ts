"use client";

import { useMutation } from "@tanstack/react-query";
import type { ClarifyingQuestion } from "@/lib/schemas/clarify";
import { BlockedHunchError } from "@/hooks/use-create-hunch";

async function postClarify(rawText: string): Promise<ClarifyingQuestion[]> {
  const res = await fetch("/api/hunch/clarify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawText }),
  });
  const body = await res.json().catch(() => null);
  // The app declining to plan this one. It surfaces here rather than at sharpen
  // because this is the first call the form makes — otherwise the user answers
  // three clarifying questions and only then gets turned down.
  if (res.status === 422 && body?.blocked) {
    throw new BlockedHunchError(body.blocked as string, body.error as string);
  }
  if (!res.ok || !Array.isArray(body?.questions)) {
    throw new Error(body?.error ?? "Couldn't think of questions right now.");
  }
  return body.questions as ClarifyingQuestion[];
}

/** Ask the coach's clarifying questions for a raw hunch. */
export function useClarify() {
  return useMutation({ mutationFn: postClarify });
}
