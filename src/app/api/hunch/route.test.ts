import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/memory/recall", () => ({ recallPriors: vi.fn(async () => []) }));
vi.mock("@/mastra/agents/hypothesis-coach", () => ({
  sharpenHunch: vi.fn(),
  streamSharpenHunch: vi.fn(),
  // The route does `err instanceof NoStructuredOutput` on the observe-only path.
  NoStructuredOutput: class NoStructuredOutput extends Error {},
}));
vi.mock("@/lib/design-draft/predesign", () => ({ predesign: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { hunch: { create: vi.fn() } },
}));

import { POST } from "./route";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sharpenHunch, streamSharpenHunch } from "@/mastra/agents/hypothesis-coach";
import { recallPriors } from "@/lib/memory/recall";
import { predesign } from "@/lib/design-draft/predesign";
import { parseServerTiming, timed, withTiming } from "@/lib/timing";
import { readNdjson } from "@/lib/ndjson";
import { SHARPEN_ERROR } from "@/lib/hunch-stream";
import { sharpenedHypothesisSchema } from "@/lib/schemas/hypothesis";

const req = (body: unknown) =>
  new Request("http://t/api/hunch", { method: "POST", body: JSON.stringify(body) });

type Line = { partial?: unknown; done?: { hunch?: { id: string }; priors?: unknown[] }; error?: string };

/** Drain a streamed sharpen into its lines. */
async function lines(res: Response): Promise<Line[]> {
  const out: Line[] = [];
  for await (const line of readNdjson(res.body!)) out.push(line as Line);
  return out;
}

/** The streaming coach, resolving to `sharpened` after emitting `partials`. */
function coachStreams(sharpened: unknown, partials: unknown[] = []) {
  vi.mocked(streamSharpenHunch).mockImplementation(
    async (_raw, _priors, _answers, _observeOnly, onPartial) => {
      for (const p of partials) onPartial?.(p as never);
      return sharpened as never;
    },
  );
}

describe("POST /api/hunch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses a medication-variation hunch before calling the model", async () => {
    const res = await POST(req({ rawText: "do I sleep better if I skip my antidepressant" }));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.blocked).toBe("medication");
    expect(body.error).toContain("can't plan a trial that changes your medication");
    // The whole point of a deterministic check: it costs nothing to run, and
    // nothing is written.
    expect(sharpenHunch).not.toHaveBeenCalled();
    expect(db.hunch.create).not.toHaveBeenCalled();
  });

  it("keeps the same hunch when the user has read that and chosen a log", async () => {
    vi.mocked(sharpenHunch).mockResolvedValue({
      statement: "I feel more tired on some days than others.",
      outcomeMetric: "tiredness rated 1-5",
      outcomeType: "continuous",
      subject: "self",
      confounders: [],
      trackers: [],
    } as never);
    vi.mocked(db.hunch.create).mockResolvedValue({ id: "h1", parameters: [] } as never);

    const res = await POST(
      req({ rawText: "do I sleep better if I skip my antidepressant", observeOnly: true }),
    );

    expect(res.status).toBe(201);
    expect(sharpenHunch).toHaveBeenCalled();
  });

  it("persists the outcome as the primary parameter plus the proposed trackers", async () => {
    coachStreams({
      statement: "Coffee after lunch makes me sleep worse.",
      outcomeMetric: "hours of sleep from a tracker",
      outcomeType: "continuous",
      subject: "self",
      confounders: [],
      trackers: [{ label: "stress", type: "amount", unit: "1-10", min: 1, max: 10 }],
      schedulable: true,
    });
    vi.mocked(db.hunch.create).mockResolvedValue({
      id: "h1",
      hypothesis: {},
      parameters: [],
    } as never);

    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
    const got = await lines(res);
    expect(res.status).toBe(200);
    expect(got.at(-1)).toHaveProperty("done");

    const arg = vi.mocked(db.hunch.create).mock.calls[0][0] as {
      data: { parameters: { create: { label: string; isPrimary: boolean; sortOrder: number }[] } };
      include: { parameters: unknown };
    };
    const created = arg.data.parameters.create;
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      label: "hours of sleep from a tracker",
      isPrimary: true,
      sortOrder: 0,
    });
    expect(created[1]).toMatchObject({ label: "stress", isPrimary: false, sortOrder: 1 });
    expect(arg.include.parameters).toBeTruthy();
  });

  it("reuses the priors clarify already recalled for this text", async () => {
    coachStreams({
      statement: "Coffee after lunch makes me sleep worse.",
      outcomeMetric: "hours of sleep from a tracker",
      outcomeType: "continuous",
      subject: "self",
      confounders: [],
      trackers: [],
      schedulable: true,
    });
    vi.mocked(db.hunch.create).mockResolvedValue({ id: "h1", parameters: [] } as never);

    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [], priorIds: ["h_caf"] }));
    await lines(res);

    expect(recallPriors).toHaveBeenCalledWith("u1", "coffee wrecks sleep", ["h_caf"]);
  });

  it("answers a coach that throws with an error line, not a bare 500", async () => {
    vi.mocked(streamSharpenHunch).mockRejectedValue(new Error("bedrock down"));

    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));

    expect(res.status).toBe(200);
    expect(await lines(res)).toEqual([{ error: SHARPEN_ERROR }]);
  });

  // The spec lists the final Zod parse failing as its own case. It reaches the
  // route by the same road — `streamSharpenHunch` throws — so it is asserted
  // here as the thing that actually differs: a rejection carrying a ZodError
  // must not escape as a 500 either.
  it("answers a hypothesis that fails validation with an error line", async () => {
    vi.mocked(streamSharpenHunch).mockImplementation(async (_raw, _priors, _answers, _observe, onPartial) => {
      onPartial?.({ statement: "Coffee after lun" } as never);
      return sharpenedHypothesisSchema.parse({ statement: "" }) as never;
    });

    const got = await lines(await POST(req({ rawText: "coffee wrecks sleep", answers: [] })));

    expect(got[0]).toHaveProperty("partial");
    expect(got.at(-1)).toEqual({ error: SHARPEN_ERROR });
  });

  it("starts designing the new hunch's plan once it is saved", async () => {
    coachStreams({
      statement: "Coffee after lunch makes me sleep worse.",
      outcomeMetric: "hours of sleep from a tracker",
      outcomeType: "continuous",
      subject: "self",
      confounders: [],
      trackers: [],
      schedulable: true,
    });
    vi.mocked(db.hunch.create).mockResolvedValue({ id: "h1", parameters: [] } as never);

    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
    await lines(res);

    expect(after).toHaveBeenCalledTimes(1);
    // `after` also accepts a promise; the routes always pass a function.
    const scheduled = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
    await scheduled();
    expect(predesign).toHaveBeenCalledWith("h1");
  });

  it("designs nothing ahead for a hunch kept as a log", async () => {
    vi.mocked(sharpenHunch).mockResolvedValue({
      statement: "I feel more tired on some days than others.",
      outcomeMetric: "tiredness rated 1-5",
      outcomeType: "continuous",
      subject: "self",
      confounders: [],
      trackers: [],
    } as never);
    vi.mocked(db.hunch.create).mockResolvedValue({ id: "h1", parameters: [] } as never);

    await POST(req({ rawText: "am I tired", observeOnly: true }));

    expect(after).not.toHaveBeenCalled();
  });

  it("designs nothing ahead when sharpening fails or is refused", async () => {
    vi.mocked(streamSharpenHunch).mockRejectedValue(new Error("bedrock down"));
    await lines(await POST(req({ rawText: "coffee wrecks sleep", answers: [] })));
    await POST(req({ rawText: "do I sleep better if I skip my antidepressant" }));

    expect(after).not.toHaveBeenCalled();
  });

  it("keeps the scheduled design untimed, even if it later runs inside a live record", async () => {
    vi.stubEnv("HUNCH_TIMING", "1");
    coachStreams({
      statement: "Coffee after lunch makes me sleep worse.",
      outcomeMetric: "hours of sleep from a tracker",
      outcomeType: "continuous",
      subject: "self",
      confounders: [],
      trackers: [],
      schedulable: true,
    });
    vi.mocked(db.hunch.create).mockResolvedValue({ id: "h1", parameters: [] } as never);
    vi.mocked(predesign).mockImplementation(async () => {
      await timed("predesign-step", async () => 1);
    });

    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
    await lines(res);
    const scheduled = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;

    // The `after()` mock above doesn't reproduce Next's real context-inheriting
    // `after()`, so calling `scheduled` bare here would prove nothing either
    // way — by the time it ran, no timing record would be active regardless of
    // `untimed`. What the doc comment on `untimed` describes is a callback that
    // runs *inside* the request's async context; this reproduces exactly that
    // by running `scheduled` inside a live record of its own. `untimed` must
    // still shield it: if it didn't, "predesign-step" would land here.
    const later = await withTiming(async () => {
      await scheduled();
      return Response.json({});
    })();

    const names = parseServerTiming(later.headers.get("Server-Timing")).map((s) => s.name);
    expect(names).not.toContain("predesign-step");
  });

  it("streams the coach's partials before the hunch it saved", async () => {
    coachStreams(
      {
        statement: "Coffee after lunch makes me sleep worse.",
        outcomeMetric: "hours of sleep from a tracker",
        outcomeType: "continuous",
        subject: "self",
        confounders: [],
        trackers: [],
        schedulable: true,
      },
      [{ statement: "Coffee after lun" }, { statement: "Coffee after lunch makes me sleep worse." }],
    );
    vi.mocked(db.hunch.create).mockResolvedValue({ id: "h1", hypothesis: {}, parameters: [] } as never);

    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
    const got = await lines(res);

    expect(res.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(got.map((l) => Object.keys(l)[0])).toEqual(["partial", "partial", "done"]);
    expect(got[0].partial).toEqual({ statement: "Coffee after lun" });
  });

  it("carries the same payload in `done` that the JSON body carried", async () => {
    coachStreams({
      statement: "Coffee after lunch makes me sleep worse.",
      outcomeMetric: "hours of sleep from a tracker",
      outcomeType: "continuous",
      subject: "self",
      confounders: [],
      trackers: [],
      schedulable: true,
    });
    vi.mocked(recallPriors).mockResolvedValue([
      { cause: "caffeine", direction: "up", confidence: 0.8 },
    ] as never);
    // A realistic create() return — a hypothesis object and a parameter row —
    // so exact equality below actually protects something: a raw Prisma row
    // (unit/min/max as null, a retiredAt instead of retired) or a dropped
    // hypothesis field would fail this, where toMatchObject would not.
    vi.mocked(db.hunch.create).mockResolvedValue({
      id: "h1",
      rawText: "coffee wrecks sleep",
      status: "sharpened",
      hypothesis: {
        id: "hy1",
        statement: "Coffee after lunch makes me sleep worse.",
        outcomeMetric: "hours of sleep from a tracker",
        outcomeType: "continuous",
        subject: "self",
        confounders: [],
        schedulable: true,
      },
      parameters: [
        {
          id: "p1",
          label: "hours of sleep from a tracker",
          type: "amount",
          unit: null,
          min: null,
          max: null,
          isPrimary: true,
          isExposure: false,
          sortOrder: 0,
          retiredAt: null,
        },
      ],
    } as never);

    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
    const done = (await lines(res)).at(-1)!.done!;

    expect(done).toEqual({
      hunch: {
        id: "h1",
        rawText: "coffee wrecks sleep",
        status: "sharpened",
        hypothesis: {
          id: "hy1",
          statement: "Coffee after lunch makes me sleep worse.",
          outcomeMetric: "hours of sleep from a tracker",
          outcomeType: "continuous",
          subject: "self",
          confounders: [],
          schedulable: true,
        },
        parameters: [
          {
            id: "p1",
            label: "hours of sleep from a tracker",
            type: "amount",
            isPrimary: true,
            isExposure: false,
            sortOrder: 0,
            retired: false,
          },
        ],
      },
      priors: [{ cause: "caffeine", direction: "up", confidence: 0.8 }],
    });
  });

  it("answers a failed write with an error line, after the partials it already streamed", async () => {
    coachStreams(
      {
        statement: "Coffee after lunch makes me sleep worse.",
        outcomeMetric: "hours of sleep from a tracker",
        outcomeType: "continuous",
        subject: "self",
        confounders: [],
        trackers: [],
        schedulable: true,
      },
      [{ statement: "Coffee after lun" }],
    );
    vi.mocked(db.hunch.create).mockRejectedValue(new Error("db down"));

    const got = await lines(await POST(req({ rawText: "coffee wrecks sleep", answers: [] })));

    expect(got[0]).toHaveProperty("partial");
    expect(got.at(-1)).toEqual({ error: SHARPEN_ERROR });
  });

  it("refuses medication before any byte is streamed", async () => {
    const res = await POST(req({ rawText: "do I sleep better if I skip my antidepressant" }));

    expect(res.status).toBe(422);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(streamSharpenHunch).not.toHaveBeenCalled();
  });

  it("keeps a log on JSON, so its diary fallback is untouched", async () => {
    vi.mocked(sharpenHunch).mockResolvedValue({
      statement: "I feel more tired on some days than others.",
      outcomeMetric: "tiredness rated 1-5",
      outcomeType: "continuous",
      subject: "self",
      confounders: [],
      trackers: [],
    } as never);
    vi.mocked(db.hunch.create).mockResolvedValue({ id: "h1", parameters: [] } as never);

    const res = await POST(req({ rawText: "am I tired", observeOnly: true }));

    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(streamSharpenHunch).not.toHaveBeenCalled();
    expect(sharpenHunch).toHaveBeenCalled();
  });

  it("logs and still pre-designs detached when after() throws outside request scope", async () => {
    coachStreams({
      statement: "Coffee after lunch makes me sleep worse.",
      outcomeMetric: "hours of sleep from a tracker",
      outcomeType: "continuous",
      subject: "self",
      confounders: [],
      trackers: [],
      schedulable: true,
    });
    vi.mocked(db.hunch.create).mockResolvedValue({ id: "h1", parameters: [] } as never);
    // The fallback does `predesign(...).catch(...)`, so it needs a real
    // promise here — mockImplementationOnce so this doesn't bleed into the
    // next test's default `predesign` mock.
    vi.mocked(predesign).mockResolvedValueOnce(undefined as never);
    vi.mocked(after).mockImplementationOnce(() => {
      throw new Error("outside request scope");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
    await lines(res);

    expect(errorSpy).toHaveBeenCalledWith(
      "[hunch] after() unavailable, pre-designing detached:",
      expect.any(Error),
    );
    expect(predesign).toHaveBeenCalledWith("h1");
    errorSpy.mockRestore();
  });

  it("leaves the coach out of Server-Timing, because the header goes out first", async () => {
    vi.stubEnv("HUNCH_TIMING", "1");
    coachStreams({
      statement: "Coffee after lunch makes me sleep worse.",
      outcomeMetric: "hours of sleep from a tracker",
      outcomeType: "continuous",
      subject: "self",
      confounders: [],
      trackers: [],
      schedulable: true,
    });
    vi.mocked(db.hunch.create).mockResolvedValue({ id: "h1", hypothesis: {}, parameters: [] } as never);

    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
    await lines(res);

    const names = parseServerTiming(res.headers.get("Server-Timing")).map((s) => s.name);
    expect(names).toContain("total");
    expect(names).not.toContain("coach");
  });
});
