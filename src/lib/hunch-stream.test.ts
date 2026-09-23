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

  it("keeps run from crashing when the reader cancels mid-flight", async () => {
    // The discriminating claim here is not "the client saw nothing after the
    // cancel" — a cancelled reader can never see more, guard or no guard, so
    // that assertion would pass by construction. What the `open` guard (and
    // its try/catch around `controller.enqueue`) actually buys is that a
    // write attempted on a dead controller doesn't throw and abort the rest
    // of `run` — which, on the real routes, still has to persist the hunch
    // after the coach finishes. So this asserts that `run` reaches its last
    // line and settles, captured directly rather than via a fixed delay.
    let releaseRun: (() => void) | null = null;
    const waitForSignal = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });

    const runExecution: string[] = [];
    let capturedRun: Promise<unknown> | null = null;

    const res = sharpenStreamResponse((emit) => {
      capturedRun = (async () => {
        runExecution.push("emitting before cancel");
        emit({ partial: "before cancel" });

        runExecution.push("awaiting cancel");
        await waitForSignal;

        // The reader has been cancelled by now; the guard's job is to stop
        // this write from throwing and aborting the rest of `run`.
        runExecution.push("emitting after cancel");
        emit({ partial: "after cancel" });

        runExecution.push("resolving");
        return { done: true };
      })();
      return capturedRun;
    }, { label: "hunch" });

    expect(res.status).toBe(200);

    const reader = res.body!.getReader();
    const { value: firstChunk } = await reader.read();
    expect(Buffer.from(firstChunk!).toString("utf-8")).toContain("before cancel");

    await reader.cancel();
    releaseRun!();

    // Wait for `run` to actually settle — resolve or reject — instead of a
    // fixed timeout. Without the guard, the post-cancel `emit` throws and
    // `run`'s promise rejects before "resolving" is ever pushed.
    await capturedRun!.catch(() => {});

    expect(runExecution).toEqual([
      "emitting before cancel",
      "awaiting cancel",
      "emitting after cancel",
      "resolving",
    ]);
  });
});
