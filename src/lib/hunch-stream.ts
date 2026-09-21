import { ndjsonLine } from "@/lib/ndjson";
import { untimed } from "@/lib/timing";

/**
 * The one thing the app says when sharpening fails, whichever road it takes.
 * Before streaming this was a 502's body; once a byte has been written the
 * status is spent, so it arrives as the stream's last line instead.
 */
export const SHARPEN_ERROR =
  "Couldn't sharpen your hunch right now. Please try again in a moment.";

/**
 * Answer a sharpen with a stream of newline-delimited JSON.
 *
 * `run` does the work and returns the payload the route would have returned
 * today; whatever it passes to `emit` goes out as a `{"partial":…}` line on
 * the way. The body always ends with exactly one terminal line — `{"done":…}`
 * or `{"error":…}` — so the client never has to guess whether a stream that
 * stopped was finished or broken.
 *
 * This is 2e6c5ad's lesson ("answer a failed design with a message, not a bare
 * 500") applied to a second route: past the first byte a 502 is no longer
 * available, so the failure has to travel in the body.
 *
 * `untimed` because the `Server-Timing` header was written when the handler
 * returned this Response, which is before `run` has done anything. Steps
 * recorded in here would be pushed into a header that has already gone out.
 */
export function sharpenStreamResponse(
  run: (emit: (partial: unknown) => void) => Promise<unknown>,
  { label }: { label: string },
): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The reader can go away mid-stream (a closed tab, a refresh). Enqueuing
      // to a dead controller throws, and the open flag catches it — so a write
      // that fails simply ends the writing without breaking the guarantee.
      let open = true;
      const write = (value: unknown) => {
        if (!open) return;

        // Compute the line before the try-catch, so serialization errors are
        // real errors (not conflated with dead-controller errors). A JSON
        // stringification failure (circular ref, BigInt, etc.) must reach the
        // outer catch and be sent as { error: SHARPEN_ERROR }.
        let line: string;
        try {
          line = ndjsonLine(value);
        } catch (err) {
          throw err;
        }

        // Only enqueue is in the try-catch that sets open = false.
        try {
          controller.enqueue(encoder.encode(line));
        } catch {
          open = false;
        }
      };

      try {
        const done = await untimed(() => run((partial) => write({ partial })));
        // Guard against undefined: if the work resolves undefined, send { done: null }
        // instead of { done: undefined }, which would serialize to {} (no done key).
        write({ done: done ?? null });
      } catch (err) {
        console.error(`[${label}] sharpen failed:`, err);
        try {
          write({ error: SHARPEN_ERROR });
        } catch {
          // Serialization of the error line itself failed (should not happen).
          // Don't escape start(); the controller will close in the finally block.
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a failed write, or by the reader going away.
        }
      }
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // A buffered response is a slower version of what this replaces.
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
