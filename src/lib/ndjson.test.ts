import { describe, expect, it } from "vitest";
import { ndjsonLine, readNdjson } from "./ndjson";

/** A stream that hands out exactly these chunks, so a test can place the seams. */
function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const value of readNdjson(stream)) out.push(value);
  return out;
}

describe("ndjsonLine", () => {
  it("writes one JSON object per line", () => {
    expect(ndjsonLine({ partial: { statement: "Coffee" } })).toBe(
      '{"partial":{"statement":"Coffee"}}\n',
    );
  });
});

describe("readNdjson", () => {
  it("yields every line of a chunk in order", async () => {
    const values = await collect(streamOf('{"a":1}\n{"a":2}\n'));
    expect(values).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("reassembles a line split across two chunks", async () => {
    const values = await collect(streamOf('{"statement":"Coffee after lun', 'ch"}\n'));
    expect(values).toEqual([{ statement: "Coffee after lunch" }]);
  });

  it("yields a final line that never got its newline", async () => {
    const values = await collect(streamOf('{"a":1}\n{"a":2}'));
    expect(values).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("skips blank lines rather than parsing them", async () => {
    const values = await collect(streamOf('\n{"a":1}\n\n'));
    expect(values).toEqual([{ a: 1 }]);
  });

  it("survives a multi-byte character split across chunks", async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('{"s":"café"}\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Straight through the two bytes of "é".
        controller.enqueue(bytes.slice(0, 10));
        controller.enqueue(bytes.slice(10));
        controller.close();
      },
    });
    expect(await collect(stream)).toEqual([{ s: "café" }]);
  });

  it("does not cancel a stream it read to exhaustion", async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"a":1}\n'));
        controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });

    await collect(stream);
    expect(cancelled).toBe(false);
  });

  it("cancels the stream when the consumer stops before exhausting it", async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Two separate enqueues, so the queue still holds the second chunk
        // (and the stream is still "readable", not yet auto-closed) when the
        // consumer breaks after the first — otherwise a single enqueue+close
        // drains and auto-closes the stream on the very first read, and
        // cancelling an already-closed stream is a spec no-op that would pass
        // this test even without the fix.
        controller.enqueue(encoder.encode('{"a":1}\n'));
        controller.enqueue(encoder.encode('{"a":2}\n'));
        controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });

    for await (const value of readNdjson(stream)) {
      expect(value).toEqual({ a: 1 });
      break;
    }

    expect(cancelled).toBe(true);
  });

  it("cancels the stream and tolerates a rejecting cancel when the consumer throws", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"a":1}\n'));
        controller.enqueue(encoder.encode('{"a":2}\n'));
        controller.close();
      },
      cancel() {
        // A cancel can itself reject (the underlying source erroring on the
        // way out); readNdjson must not let that mask the consumer's own error.
        return Promise.reject(new Error("cancel failed"));
      },
    });

    async function consume() {
      for await (const value of readNdjson(stream)) {
        void value;
        throw new Error("consumer blew up");
      }
    }

    await expect(consume()).rejects.toThrow("consumer blew up");
  });
});
