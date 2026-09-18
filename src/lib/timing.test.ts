import { afterEach, describe, expect, it, vi } from "vitest";
import { llmUsage, parseServerTiming, timed, untimed, withTiming } from "./timing";

const json = (body: unknown) => Response.json(body);

/** A promise and the function that resolves it, for forcing an interleaving. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("timing, switched off", () => {
  it("returns the handler's own response, untouched", async () => {
    vi.stubEnv("HUNCH_TIMING", "");
    const response = json({ ok: true });
    const handler = vi.fn<(req: Request, ctx: { id: string }) => Promise<Response>>(async () => response);

    const req = new Request("http://localhost/x");
    const out = await withTiming(handler)(req, { id: "h1" });

    expect(out).toBe(response);
    expect(out.headers.has("Server-Timing")).toBe(false);
    expect(handler).toHaveBeenCalledWith(req, { id: "h1" });
  });

  it("treats anything but 1 as off", async () => {
    vi.stubEnv("HUNCH_TIMING", "true");
    const out = await withTiming(async () => json({}))();
    expect(out.headers.has("Server-Timing")).toBe(false);
  });

  it("makes timed a pass-through that never reads usage", async () => {
    vi.stubEnv("HUNCH_TIMING", "");
    const value = { object: 1 };
    const usageOf = vi.fn(() => ({ inputTokens: 1, outputTokens: 1 }));

    await expect(timed("coach", async () => value, usageOf)).resolves.toBe(value);
    expect(usageOf).not.toHaveBeenCalled();
  });

  it("passes errors through unchanged", async () => {
    vi.stubEnv("HUNCH_TIMING", "");
    const boom = new Error("boom");
    await expect(timed("coach", async () => { throw boom; })).rejects.toBe(boom);
  });

  it("records nothing when a step runs outside a request, even with timing on", async () => {
    vi.stubEnv("HUNCH_TIMING", "1");
    await expect(timed("coach", async () => 7)).resolves.toBe(7);
  });
});

describe("timing, switched on", () => {
  it("adds a Server-Timing header with every step and the total", async () => {
    vi.stubEnv("HUNCH_TIMING", "1");
    const response = json({ ok: true });

    const out = await withTiming(async () => {
      await timed("recall", async () => ({}), () => ({ inputTokens: 640, outputTokens: 38 }));
      await timed("clarifier", async () => ({}));
      return response;
    })();

    expect(out).toBe(response);
    const header = out.headers.get("Server-Timing")!;
    expect(header).toMatch(
      /^recall;dur=\d+\.\d;desc="in=640 out=38", clarifier;dur=\d+\.\d, total;dur=\d+\.\d$/,
    );
    const steps = parseServerTiming(header);
    expect(steps.map((s) => s.name)).toEqual(["recall", "clarifier", "total"]);
    for (const s of steps) expect(s.dur).toBeGreaterThanOrEqual(0);
    expect(steps[0]).toMatchObject({ inputTokens: 640, outputTokens: 38 });
  });

  it("measures real elapsed time", async () => {
    vi.stubEnv("HUNCH_TIMING", "1");
    const out = await withTiming(async () => {
      await timed("designer", () => new Promise((r) => setTimeout(r, 25)));
      return json({});
    })();
    const [designer, total] = parseServerTiming(out.headers.get("Server-Timing")!);
    expect(designer.dur).toBeGreaterThanOrEqual(20);
    expect(total.dur).toBeGreaterThanOrEqual(designer.dur);
  });

  it("writes only the token counts it has", async () => {
    vi.stubEnv("HUNCH_TIMING", "1");
    const out = await withTiming(async () => {
      await timed("analyst", async () => ({}), () => ({ inputTokens: 12 }));
      await timed("safety", async () => ({}), () => undefined);
      return json({});
    })();
    const header = out.headers.get("Server-Timing")!;
    expect(header).toMatch(/analyst;dur=\d+\.\d;desc="in=12", safety;dur=\d+\.\d, total/);
  });

  it("rethrows a failed step's error unchanged and still records its duration", async () => {
    vi.stubEnv("HUNCH_TIMING", "1");
    const boom = new Error("model down");

    const out = await withTiming(async () => {
      try {
        await timed("coach", async () => { throw boom; });
      } catch (err) {
        expect(err).toBe(boom);
        return json({ error: "sorry" });
      }
      return json({});
    })();

    const names = parseServerTiming(out.headers.get("Server-Timing")!).map((s) => s.name);
    expect(names).toEqual(["coach", "total"]);
  });

  it("suffixes a step name that repeats instead of overwriting it", async () => {
    vi.stubEnv("HUNCH_TIMING", "1");
    const out = await withTiming(async () => {
      await timed("designer", async () => 1);
      await timed("designer", async () => 2);
      await timed("designer", async () => 3);
      return json({});
    })();
    const names = parseServerTiming(out.headers.get("Server-Timing")!).map((s) => s.name);
    expect(names).toEqual(["designer", "designer-2", "designer-3", "total"]);
  });

  it("keeps overlapping requests' steps apart", async () => {
    vi.stubEnv("HUNCH_TIMING", "1");
    const gateA = deferred();
    const gateB = deferred();

    const a = withTiming(async () => {
      await timed("clarifier", () => gateA.promise);
      await timed("recall", async () => null);
      return json({ who: "a" });
    })();
    const b = withTiming(async () => {
      await timed("coach", () => gateB.promise);
      return json({ who: "b" });
    })();

    // Both handlers are now mid-step; finish them in the opposite order.
    gateB.resolve();
    const outB = await b;
    gateA.resolve();
    const outA = await a;

    const names = (r: Response) =>
      parseServerTiming(r.headers.get("Server-Timing")!).map((s) => s.name);
    expect(names(outA)).toEqual(["clarifier", "recall", "total"]);
    expect(names(outB)).toEqual(["coach", "total"]);
  });

  it("propagates a handler's own error", async () => {
    vi.stubEnv("HUNCH_TIMING", "1");
    const boom = new Error("unhandled");
    await expect(withTiming(async () => { throw boom; })()).rejects.toBe(boom);
  });
});

describe("llmUsage", () => {
  it("prefers the total across steps over the last step's usage", () => {
    expect(
      llmUsage({
        usage: { inputTokens: 1, outputTokens: 2 },
        totalUsage: { inputTokens: 10, outputTokens: 20 },
      }),
    ).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it("falls back to the last step, and to nothing", () => {
    expect(llmUsage({ usage: { inputTokens: 1, outputTokens: 2 } })).toEqual({
      inputTokens: 1,
      outputTokens: 2,
    });
    expect(llmUsage({})).toBeUndefined();
    expect(llmUsage(undefined)).toBeUndefined();
  });
});

describe("parseServerTiming", () => {
  it("reads names, durations and token counts back out", () => {
    expect(
      parseServerTiming('db-load;dur=3.2, coach;dur=9412.0;desc="in=1210 out=402", total;dur=9500.9'),
    ).toEqual([
      { name: "db-load", dur: 3.2 },
      { name: "coach", dur: 9412, inputTokens: 1210, outputTokens: 402 },
      { name: "total", dur: 9500.9 },
    ]);
  });

  it("returns nothing for an absent header", () => {
    expect(parseServerTiming(null)).toEqual([]);
  });
});

describe("untimed", () => {
  it("keeps a step started inside it off the enclosing request's header", async () => {
    vi.stubEnv("HUNCH_TIMING", "1");
    const out = await withTiming(async () => {
      await timed("inline", async () => 1);
      await untimed(() => timed("background", async () => 2));
      return json({});
    })();

    const names = parseServerTiming(out.headers.get("Server-Timing")).map((e) => e.name);
    expect(names).toContain("inline");
    expect(names).not.toContain("background");
  });

  it("returns what the function returns", async () => {
    await expect(untimed(async () => 42)).resolves.toBe(42);
  });
});
