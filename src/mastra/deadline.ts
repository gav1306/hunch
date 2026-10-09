/**
 * How long one model call may take before it is abandoned.
 *
 * Without a deadline a hung provider holds the request open until the platform
 * kills it, and the page that asked sits on its skeleton the whole time. The
 * slowest healthy one-shot call measured is ~9s (designer, thinking on), so 25s
 * leaves room for a slow day and still ends in an error the UI can show.
 */
export const LLM_DEADLINE_MS = 25_000;

/** A streamed reply types out over time, so it gets longer. */
export const LLM_STREAM_DEADLINE_MS = 60_000;

/** A fresh signal per call, so a retry gets its own full deadline. */
export function llmDeadline(ms: number = LLM_DEADLINE_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}
