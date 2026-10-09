import type { z } from "zod";

/**
 * The message to show for a hunch request that failed validation. A field's own
 * message ("Keep a hunch shorter than…") when one applies; otherwise the old
 * catch-all, which is right for a missing or unreadable body.
 */
export function hunchRequestError(error: z.ZodError): string {
  const field = error.issues.find((i) => i.path[0] === "rawText" || i.path[0] === "answers");
  return field?.message ?? "A hunch can't be empty.";
}
