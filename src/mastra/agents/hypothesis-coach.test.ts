import { beforeEach, describe, expect, it, vi } from "vitest";

// buildSharpenPrompt is pure, but importing the module constructs `new Agent(...)`
// at load time — stub the Agent + model so no live client is built.
vi.mock("@mastra/core/agent", () => ({
  Agent: class {
    generate = vi.fn();
    stream = vi.fn();
  },
}));
vi.mock("@/mastra/model", () => ({ claudeModel: {} }));

import {
  buildSharpenPrompt,
  hypothesisCoach,
  normaliseSchedulability,
  NoStructuredOutput,
  sharpenHunch,
  streamSharpenHunch,
} from "@/mastra/agents/hypothesis-coach";
import {
  sharpenedHypothesisObjectSchema,
  sharpenedHypothesisSchema,
  type SharpenedHypothesis,
} from "@/lib/schemas/hypothesis";

function baseHypothesis(overrides: Partial<SharpenedHypothesis> = {}): SharpenedHypothesis {
  return {
    statement: "Coffee after lunch makes me sleep worse.",
    outcomeMetric: "hours of sleep from a tracker",
    outcomeType: "continuous",
    confounders: [],
    subject: "self",
    trackers: [],
    schedulable: true,
    exposure: undefined,
    ...overrides,
  };
}

describe("buildSharpenPrompt", () => {
  it("includes the raw hunch", () => {
    const p = buildSharpenPrompt("coffee wrecks sleep", [], []);
    expect(p).toContain("coffee wrecks sleep");
  });

  it("folds clarifying answers in as ground truth", () => {
    const p = buildSharpenPrompt("coffee wrecks sleep", [], [
      { id: "measure", prompt: "How would you track it?", answer: "sleep score" },
    ]);
    expect(p).toContain("sleep score");
    expect(p).toContain("How would you track it?");
  });

  it("omits the answers block when there are none", () => {
    const p = buildSharpenPrompt("x", [], []);
    expect(p.toLowerCase()).not.toContain("ground truth");
  });
});

describe("buildSharpenPrompt for a log", () => {
  it("tells the coach to write something to watch for, not something to do", () => {
    const prompt = buildSharpenPrompt("skip my antidepressant", [], [], true);
    expect(prompt).toContain("LOG, not a trial");
    expect(prompt).toContain("WATCH FOR");
  });

  it("says nothing of the sort for an ordinary trial", () => {
    const prompt = buildSharpenPrompt("coffee wrecks my sleep", [], []);
    expect(prompt).not.toContain("LOG, not a trial");
  });

  it("still carries the raw text either way", () => {
    expect(buildSharpenPrompt("coffee wrecks my sleep", [], [], true)).toContain(
      "coffee wrecks my sleep",
    );
  });
});

describe("normaliseSchedulability", () => {
  it("falls back to schedulable when the model forgets the exposure", () => {
    const h = baseHypothesis({ schedulable: false, exposure: undefined });
    const result = normaliseSchedulability(h);
    expect(result.schedulable).toBe(true);
    expect(result.exposure).toBeUndefined();
  });

  it("leaves a well-formed opportunity-dependent hypothesis unchanged", () => {
    const exposure = { label: "Played basketball", type: "binary" as const };
    const h = baseHypothesis({ schedulable: false, exposure });
    const result = normaliseSchedulability(h);
    expect(result).toEqual(h);
  });

  it("leaves a schedulable hypothesis with an exposure unchanged", () => {
    const exposure = { label: "Skipped coffee after 2pm", type: "binary" as const };
    const h = baseHypothesis({ schedulable: true, exposure });
    const result = normaliseSchedulability(h);
    expect(result).toEqual(h);
  });
});

describe("sharpenHunch", () => {
  const generate = hypothesisCoach.generate as unknown as ReturnType<typeof vi.fn>;

  /**
   * Mirrors what Mastra does with `structuredOutput`: validate the model's raw
   * object against the schema it was handed, through the standard-schema
   * interface (which runs zod refinements), throw on issues, and hand back the
   * validated value as `response.object`. A mock that skipped this step is how
   * the fallback below looked reachable when it wasn't.
   */
  function modelReturns(raw: unknown) {
    generate.mockImplementation(
      async (
        _prompt: string,
        opts: { structuredOutput: { schema: { "~standard": { validate: (v: unknown) => unknown } } } },
      ) => {
        const result = (await opts.structuredOutput.schema["~standard"].validate(raw)) as {
          value?: unknown;
          issues?: unknown[];
        };
        if (result.issues) throw new Error("Structured output validation failed");
        return { object: result.value };
      },
    );
  }

  it("reaches the schedulability fallback when the model says unschedulable but names no yes/no", async () => {
    modelReturns({
      statement: "Playing basketball eases my knee pain.",
      outcomeMetric: "knee pain 1-5",
      outcomeType: "continuous",
      schedulable: false,
    });

    const result = await sharpenHunch("basketball helps my knee");

    expect(result.schedulable).toBe(true);
    expect(result.exposure).toBeUndefined();
    // Defaults filled, and valid against the full refined schema.
    expect(result.confounders).toEqual([]);
    expect(sharpenedHypothesisSchema.safeParse(result).success).toBe(true);
  });

  it("still rejects an exposure that isn't a yes/no", async () => {
    modelReturns({
      statement: "Playing basketball eases my knee pain.",
      outcomeMetric: "knee pain 1-5",
      outcomeType: "continuous",
      schedulable: false,
      exposure: { label: "Minutes of basketball", type: "amount" },
    });

    await expect(sharpenHunch("basketball helps my knee")).rejects.toThrow();
  });
});

/** A stand-in for Mastra's MastraModelOutput: the partials, then the object. */
function fakeStream(partials: unknown[], object: unknown | Promise<unknown>) {
  return {
    objectStream: new ReadableStream({
      start(controller) {
        for (const p of partials) controller.enqueue(p);
        controller.close();
      },
    }),
    object: object instanceof Promise ? object : Promise.resolve(object),
    totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 20 }),
  };
}

describe("streamSharpenHunch", () => {
  // hypothesisCoach.stream is one vi.fn() shared by every test in this file;
  // without a fresh call history, "asks for the same prompt..." below would
  // inspect an earlier test's call instead of its own.
  beforeEach(() => vi.clearAllMocks());

  it("hands every partial to the callback, in the order the model wrote them", async () => {
    const partials = [
      { statement: "Coffee after lun" },
      { statement: "Coffee after lunch makes me sleep worse.", outcomeMetric: "hours of" },
    ];
    vi.mocked(hypothesisCoach.stream).mockResolvedValue(
      fakeStream(partials, baseHypothesis()) as never,
    );

    const seen: unknown[] = [];
    await streamSharpenHunch("coffee wrecks sleep", [], [], false, (p) => seen.push(p));

    expect(seen).toEqual(partials);
  });

  it("returns the same validated hypothesis the generated path returns", async () => {
    vi.mocked(hypothesisCoach.stream).mockResolvedValue(
      fakeStream([], {
        statement: "Coffee after lunch makes me sleep worse.",
        outcomeMetric: "hours of sleep from a tracker",
        outcomeType: "continuous",
        confounders: [],
        subject: "self",
        trackers: [],
        schedulable: true,
      }) as never,
    );

    const h = await streamSharpenHunch("coffee wrecks sleep");

    expect(sharpenedHypothesisSchema.safeParse(h).success).toBe(true);
    expect(h.statement).toBe("Coffee after lunch makes me sleep worse.");
  });

  it("repairs an unschedulable hypothesis with no exposure, exactly as generate does", async () => {
    vi.mocked(hypothesisCoach.stream).mockResolvedValue(
      fakeStream([], baseHypothesis({ schedulable: false })) as never,
    );

    const h = await streamSharpenHunch("basketball wrecks my knee");

    expect(h.schedulable).toBe(true);
  });

  it("asks for the same prompt, schema and token cap as the generated path", async () => {
    vi.mocked(hypothesisCoach.stream).mockResolvedValue(fakeStream([], baseHypothesis()) as never);

    await streamSharpenHunch("coffee wrecks sleep", [], [
      { id: "measure", prompt: "How would you track it?", answer: "sleep score" },
    ]);

    // `Agent.stream` is overloaded; `Parameters<>`-style inference on the mock
    // picks the last (single-arg) overload, so the two-arg call shape here
    // needs the `unknown` bridge tsc asks for, not a direct cast.
    const [prompt, options] = vi.mocked(hypothesisCoach.stream).mock.calls[0] as unknown as [
      string,
      { structuredOutput: { schema: unknown }; modelSettings: { maxOutputTokens: number } },
    ];
    expect(prompt).toBe(
      buildSharpenPrompt("coffee wrecks sleep", [], [
        { id: "measure", prompt: "How would you track it?", answer: "sleep score" },
      ]),
    );
    expect(options.structuredOutput.schema).toBe(sharpenedHypothesisObjectSchema);
    expect(options.modelSettings.maxOutputTokens).toBe(1024);
  });

  it("throws NoStructuredOutput when the model never completes an object", async () => {
    vi.mocked(hypothesisCoach.stream).mockResolvedValue(
      fakeStream([{ statement: "I can't help with" }], Promise.reject(new Error("no object"))) as never,
    );

    await expect(streamSharpenHunch("skip my statin")).rejects.toBeInstanceOf(NoStructuredOutput);
  });
});
