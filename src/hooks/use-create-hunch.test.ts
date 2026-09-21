import { describe, expect, it, vi, afterEach } from "vitest";
import { BlockedHunchError, postHunch } from "./use-create-hunch";

/** A response whose body arrives as exactly these chunks. */
function streamed(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(res: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(res);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const input = { rawText: "coffee wrecks sleep", answers: [] };
const done = { hunch: { id: "h1", hypothesis: { statement: "Coffee." } }, priors: [{ cause: "caffeine" }] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postHunch, streaming", () => {
  it("resolves with the done payload and feeds every partial on the way", async () => {
    mockFetch(
      streamed([
        '{"partial":{"statement":"Coffee after lun"}}\n',
        '{"partial":{"statement":"Coffee after lunch makes me sleep worse."}}\n',
        `${JSON.stringify({ done })}\n`,
      ]),
    );

    const seen: unknown[] = [];
    const result = await postHunch(input, undefined, (p) => seen.push(p));

    expect(seen).toEqual([
      { statement: "Coffee after lun" },
      { statement: "Coffee after lunch makes me sleep worse." },
    ]);
    expect(result).toMatchObject({ id: "h1", priors: [{ cause: "caffeine" }] });
  });

  it("reassembles a line the network split in two", async () => {
    mockFetch(
      streamed([`${JSON.stringify({ done }).slice(0, 20)}`, `${JSON.stringify({ done }).slice(20)}\n`]),
    );

    await expect(postHunch(input)).resolves.toMatchObject({ id: "h1" });
  });

  it("rejects with the message an error line carries", async () => {
    mockFetch(
      streamed([
        '{"partial":{"statement":"Coffee after lun"}}\n',
        '{"error":"Couldn\'t sharpen your hunch right now. Please try again in a moment."}\n',
      ]),
    );

    const seen: unknown[] = [];
    await expect(postHunch(input, undefined, (p) => seen.push(p))).rejects.toThrow(
      "Couldn't sharpen your hunch right now",
    );
    // The half-written text was still delivered; the form keeps it on screen.
    expect(seen).toHaveLength(1);
  });

  it("rejects when the stream ends with no terminal line", async () => {
    mockFetch(streamed(['{"partial":{"statement":"Coffee after lun"}}\n']));

    await expect(postHunch(input)).rejects.toThrow("Something went wrong sharpening your hunch.");
  });

  it("rejects when a line is not JSON at all", async () => {
    mockFetch(streamed(["<!doctype html>\n"]));

    await expect(postHunch(input)).rejects.toThrow("Something went wrong sharpening your hunch.");
  });

  it("posts a redo to the resume route", async () => {
    const fetchMock = mockFetch(streamed([`${JSON.stringify({ done })}\n`]));

    await postHunch(input, "h1");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/hunch/h1/sharpen");
  });
});

describe("postHunch, JSON", () => {
  it("raises a BlockedHunchError on the medication refusal", async () => {
    mockFetch(jsonResponse({ blocked: "medication", error: "We can't plan that." }, 422));

    await expect(postHunch(input)).rejects.toBeInstanceOf(BlockedHunchError);
  });

  it("takes the 201 body of an observe-only sharpen", async () => {
    mockFetch(jsonResponse(done, 201));

    await expect(postHunch({ ...input, observeOnly: true })).resolves.toMatchObject({ id: "h1" });
  });

  it("raises the message of a plain error body", async () => {
    mockFetch(jsonResponse({ error: "Unauthorized" }, 401));

    await expect(postHunch(input)).rejects.toThrow("Unauthorized");
  });
});
