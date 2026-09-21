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

  it("sends error line when a partial cannot be serialized", async () => {
    const circular: Record<string, unknown> = { x: 1 };
    circular.self = circular; // Create circular reference

    const res = sharpenStreamResponse(async (emit) => {
      emit(circular);
      return { done: true };
    }, { label: "hunch" });

    expect(res.status).toBe(200);
    const got = await lines(res);

    // Serialization failure on partial causes immediate error
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual({ error: SHARPEN_ERROR });

    expect(console.error).toHaveBeenCalledWith(
      "[hunch] sharpen failed:",
      expect.any(Error),
    );
  });

  it("sends error line when the result cannot be serialized", async () => {
    const circular: Record<string, unknown> = { x: 1 };
    circular.self = circular; // Create circular reference

    const res = sharpenStreamResponse(async (emit) => {
      emit({ partial: "Coffee..." });
      return circular;
    }, { label: "hunch" });

    expect(res.status).toBe(200);
    const got = await lines(res);

    // Partial is sent, then error line when trying to send done
    expect(got).toHaveLength(2);
    expect(got[0]).toEqual({ partial: { partial: "Coffee..." } });
    expect(got[1]).toEqual({ error: SHARPEN_ERROR });

    expect(console.error).toHaveBeenCalledWith(
      "[hunch] sharpen failed:",
      expect.any(Error),
    );
  });

  it("converts undefined result to null to preserve done key", async () => {
    const res = sharpenStreamResponse(async (emit) => {
      emit({ statement: "test" });
      return undefined;
    }, { label: "hunch" });

    expect(res.status).toBe(200);
    const got = await lines(res);

    expect(got).toHaveLength(2);
    expect(got[0]).toEqual({ partial: { statement: "test" } });
    expect(got[1]).toEqual({ done: null });
  });

  it("silently stops writing when the reader cancels mid-flight", async () => {
    let releaseRun: (() => void) | null = null;
    const waitForSignal = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });

    // Track what run attempts to do so we can verify the guard is protecting against post-cancel writes
    const runExecution: string[] = [];

    const res = sharpenStreamResponse(async (emit) => {
      runExecution.push("emitting before cancel");
      emit({ partial: "before cancel" });

      runExecution.push("awaiting cancel");
      await waitForSignal;

      // After this point, the reader has been cancelled and the stream is closed.
      // The guard's job is to prevent these writes from going to a dead stream.
      runExecution.push("emitting after cancel");
      emit({ partial: "after cancel" });

      runExecution.push("resolving");
      return { done: true };
    }, { label: "hunch" });

    expect(res.status).toBe(200);

    const reader = res.body!.getReader();

    // Read the first chunk (the "before cancel" partial)
    const { value: firstChunk } = await reader.read();
    expect(firstChunk).toBeDefined();

    // Cancel the reader while run is still awaiting
    await reader.cancel();

    // Release run to continue — it will execute fully but the post-cancel writes
    // will be silently dropped by the open flag guard.
    releaseRun!();

    // Wait for run to finish all its operations
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify that run executed all the way through
    expect(runExecution).toContain("emitting after cancel");
    expect(runExecution).toContain("resolving");

    // But verify the client never saw the post-cancel data
    const clientData = Buffer.concat([firstChunk!]).toString("utf-8");

    // The client should have exactly one line: the before-cancel partial
    expect(clientData).toContain("before cancel");
    // The client should NOT have the after-cancel partial — the guard prevented it
    expect(clientData).not.toContain("after cancel");
  });

});
