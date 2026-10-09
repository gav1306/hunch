import { afterEach, describe, expect, it, vi } from "vitest";
import { postDesign } from "./use-design-protocol";

const input = { parameters: [], schedulable: true };

describe("postDesign", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the request with a deadline", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await postDesign("h1", input);

    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("turns a timeout into a message the error card can show", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("signal timed out", "TimeoutError");
      }),
    );

    await expect(postDesign("h1", input)).rejects.toThrow(/taking longer than it should/i);
  });
});
