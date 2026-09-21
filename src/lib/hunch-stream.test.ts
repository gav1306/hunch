import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readNdjson } from "./ndjson";
import { SHARPEN_ERROR, sharpenStreamResponse } from "./hunch-stream";

type Line = { partial?: unknown; done?: unknown; error?: string };

async function lines(res: Response): Promise<Line[]> {
  const out: Line[] = [];
  for await (const line of readNdjson(res.body!)) out.push(line as Line);
  return out;
}

describe("sharpenStreamResponse", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("streams every partial, then exactly one done line", async () => {
    const res = sharpenStreamResponse(async (emit) => {
      emit({ statement: "Coffee after lun" });
      emit({ statement: "Coffee after lunch makes me sleep worse." });
      return { hunch: { id: "h1" }, priors: [] };
    }, { label: "hunch" });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/x-ndjson");

    const got = await lines(res);
    expect(got.map((l) => Object.keys(l)[0])).toEqual(["partial", "partial", "done"]);
    expect(got[2].done).toEqual({ hunch: { id: "h1" }, priors: [] });
  });

  it("ends a failure after the first byte with an error line, not a thrown 500", async () => {
    const res = sharpenStreamResponse(async (emit) => {
      emit({ statement: "Coffee after lun" });
      throw new Error("bedrock down");
    }, { label: "hunch" });

    // The status was spent before anything went wrong; it stays a 200.
    expect(res.status).toBe(200);
    const got = await lines(res);
    // The half-written text the user watched appear is still there.
    expect(got[0].partial).toEqual({ statement: "Coffee after lun" });
    expect(got.at(-1)).toEqual({ error: SHARPEN_ERROR });
    expect(got.filter((l) => "done" in l)).toHaveLength(0);
  });

  it("fails with an error line when nothing was streamed at all", async () => {
    const res = sharpenStreamResponse(async () => {
      throw new Error("the write rejected");
    }, { label: "hunch" });

    expect(await lines(res)).toEqual([{ error: SHARPEN_ERROR }]);
  });

  it("logs the real error server-side under the route's label", async () => {
    const res = sharpenStreamResponse(async () => {
      throw new Error("bedrock down");
    }, { label: "re-sharpen" });
    await lines(res);

    expect(console.error).toHaveBeenCalledWith(
      "[re-sharpen] sharpen failed:",
      expect.objectContaining({ message: "bedrock down" }),
    );
  });
});
