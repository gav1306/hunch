"use client";

import { useMutation } from "@tanstack/react-query";
import type { SharpenedHypothesis, SharpenedHypothesisDraft } from "@/lib/schemas/hypothesis";
import type { Prior } from "@/lib/schemas/prior";
import type { ClarifyingAnswer } from "@/lib/schemas/clarify";
import type { Parameter } from "@/lib/schemas/parameter";
import { readNdjson } from "@/lib/ndjson";

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

/** What the Coach has written so far, in the schema's own field order. */
export type PartialHypothesis = Partial<SharpenedHypothesisDraft>;

type SharpenInput = {
  rawText: string;
  answers: ClarifyingAnswer[];
  observeOnly?: boolean;
  priorIds?: string[];
};

/** One line of a streamed sharpen. Exactly one terminal line ends the body. */
type SharpenLine = {
  partial?: PartialHypothesis;
  done?: { hunch?: unknown; priors?: Prior[] };
  error?: string;
};

const GENERIC_FAILURE = "Something went wrong sharpening your hunch.";

/**
 * Post a hunch and read the sharpened hypothesis back.
 *
 * A trial streams: the route answers with one JSON object per line, the
 * partials go to `onPartial` so the form can type the statement out, and the
 * last line is the `done` payload this resolves with — the same body the route
 * used to return in one piece.
 *
 * Everything that can refuse still answers with a real status and a JSON body:
 * the 401, the empty-input 400, the medication 422. `observeOnly` answers with
 * JSON too. Exported (rather than left private to the hook) so the line
 * handling can be tested without React.
 */
export async function postHunch(
  input: SharpenInput,
  resumeId?: string,
  onPartial?: (partial: PartialHypothesis) => void,
): Promise<HunchWithHypothesis> {
  const res = await fetch(resumeId ? `/api/hunch/${resumeId}/sharpen` : "/api/hunch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const streaming = (res.headers.get("Content-Type") ?? "").includes("ndjson");
  if (!streaming || !res.body) {
    // Tolerate a non-JSON / empty body (e.g. an unhandled 5xx) instead of
    // letting res.json() throw a raw "Unexpected end of JSON input" at the UI.
    const body = await res.json().catch(() => null);
    if (res.status === 422 && body?.blocked) {
      throw new BlockedHunchError(body.blocked as string, body.error as string);
    }
    if (!res.ok || !body?.hunch) {
      throw new Error(body?.error ?? GENERIC_FAILURE);
    }
    return { ...body.hunch, priors: body.priors ?? [] } as HunchWithHypothesis;
  }

  let result: HunchWithHypothesis | null = null;
  let failure: string | null = null;
  try {
    for await (const line of readNdjson(res.body)) {
      const msg = line as SharpenLine;
      if (msg.error) failure = msg.error;
      else if (msg.done?.hunch) {
        result = { ...(msg.done.hunch as object), priors: msg.done.priors ?? [] } as HunchWithHypothesis;
      } else if (msg.partial) onPartial?.(msg.partial);
    }
  } catch {
    // A torn stream: a line that wasn't JSON, or a connection that dropped.
    // Same dead end as an error line, and whatever was already typed out stays
    // on screen either way.
  }

  if (failure) throw new Error(failure);
  if (!result) throw new Error(GENERIC_FAILURE);
  return result;
}

/**
 * Drop a free-text hunch and get back its sharpened hypothesis.
 *
 * With `resumeId`, the same flow re-sharpens that hunch in place instead of
 * creating another one — so "redo" keeps the user's original text and doesn't
 * strand the old hunch in "Finish setting up" forever.
 */
export function useCreateHunch(
  resumeId?: string,
  onPartial?: (partial: PartialHypothesis) => void,
) {
  return useMutation({
    mutationFn: (input: SharpenInput) => postHunch(input, resumeId, onPartial),
  });
}
