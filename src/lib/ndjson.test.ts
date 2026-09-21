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
});
