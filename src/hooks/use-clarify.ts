"use client";

import { useMutation } from "@tanstack/react-query";
import type { ClarifyingQuestion } from "@/lib/schemas/clarify";
import { BlockedHunchError } from "@/hooks/use-create-hunch";

export type ClarifyResult = {
  questions: ClarifyingQuestion[];
  /** Prior ids recall picked for this text; hand them to sharpen to skip a repeat. */
  priorIds?: string[];
};

async function postClarify(rawText: string): Promise<ClarifyResult> {
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
  return {
    questions: body.questions as ClarifyingQuestion[],
    priorIds: Array.isArray(body.priorIds) ? (body.priorIds as string[]) : undefined,
  };
}

/** Ask the coach's clarifying questions for a raw hunch. */
export function useClarify() {
  return useMutation({ mutationFn: postClarify });
}
