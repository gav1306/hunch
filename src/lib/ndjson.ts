/**
 * Newline-delimited JSON: one complete JSON value per line.
 *
 * The sharpen routes answer with a stream of these rather than one body, so
 * the user watches the hypothesis being written instead of watching a button
 * for up to 11.5s. Server-Sent Events would have been the obvious transport,
 * but `EventSource` is GET-only and sharpening is a POST with a body — and
 * `fetch` already hands the client a reader.
 *
 * Used by both ends: the routes write with `ndjsonLine`, the client hook and
 * the bench read with `readNdjson`.
 */

/** One value, serialised as a line. */
export function ndjsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

/**
 * Read a body back into the values that were written to it.
 *
 * A chunk boundary can fall anywhere — mid-line, or between the two bytes of
 * a "é" — so the remainder is buffered and the decoder is kept in streaming
 * mode. Blank lines are skipped; a malformed one throws, which callers treat
 * as a torn stream.
 */
export async function* readNdjson(stream: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (let nl = buffer.indexOf("\n"); nl !== -1; nl = buffer.indexOf("\n")) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) yield JSON.parse(line);
      }
    }
    // Flush the decoder, then whatever line never got its newline.
    const tail = (buffer + decoder.decode()).trim();
    if (tail) yield JSON.parse(tail);
    finished = true;
  } finally {
    // A consumer that breaks or throws out of the `for await` (e.g. `onPartial`
    // itself throwing) leaves the body mid-read rather than exhausted. Cancel
    // it so the underlying connection is released instead of left undrained;
    // a reader that already ran to completion has nothing left to cancel, and
    // cancelling it anyway is harmless but pointless.
    if (!finished) {
      try {
        await reader.cancel();
      } catch {
        // The stream may already be closed or erroring; cancelling it again
        // rejecting is not this generator's problem to surface.
      }
    }
    reader.releaseLock();
  }
}
