import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/memory/recall", () => ({ recallPriors: vi.fn(async () => []) }));
vi.mock("@/mastra/agents/hypothesis-coach", () => ({ sharpenHunch: vi.fn() }));
vi.mock("@/lib/design-draft/predesign", () => ({ predesign: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { hunch: { create: vi.fn() } },
}));

import { POST } from "./route";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sharpenHunch } from "@/mastra/agents/hypothesis-coach";
import { recallPriors } from "@/lib/memory/recall";
import { predesign } from "@/lib/design-draft/predesign";
import { parseServerTiming, timed, withTiming } from "@/lib/timing";

const req = (body: unknown) =>
  new Request("http://t/api/hunch", { method: "POST", body: JSON.stringify(body) });

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
    vi.mocked(sharpenHunch).mockResolvedValue({
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
    expect(res.status).toBe(201);

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
    vi.mocked(sharpenHunch).mockResolvedValue({
      statement: "Coffee after lunch makes me sleep worse.",
      outcomeMetric: "hours of sleep from a tracker",
      outcomeType: "continuous",
      subject: "self",
      confounders: [],
      trackers: [],
      schedulable: true,
    });
    vi.mocked(db.hunch.create).mockResolvedValue({ id: "h1", parameters: [] } as never);

    await POST(req({ rawText: "coffee wrecks sleep", answers: [], priorIds: ["h_caf"] }));

    expect(recallPriors).toHaveBeenCalledWith("u1", "coffee wrecks sleep", ["h_caf"]);
  });

  it("502s when the coach throws", async () => {
    vi.mocked(sharpenHunch).mockRejectedValue(new Error("bedrock down"));
    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
    expect(res.status).toBe(502);
  });

  it("starts designing the new hunch's plan once it is saved", async () => {
    vi.mocked(sharpenHunch).mockResolvedValue({
      statement: "Coffee after lunch makes me sleep worse.",
      outcomeMetric: "hours of sleep from a tracker",
      outcomeType: "continuous",
      subject: "self",
      confounders: [],
      trackers: [],
      schedulable: true,
    });
    vi.mocked(db.hunch.create).mockResolvedValue({ id: "h1", parameters: [] } as never);

    await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));

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
    vi.mocked(sharpenHunch).mockRejectedValue(new Error("bedrock down"));
    await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
    await POST(req({ rawText: "do I sleep better if I skip my antidepressant" }));

    expect(after).not.toHaveBeenCalled();
  });

  it("keeps the scheduled design untimed, even if it later runs inside a live record", async () => {
    vi.stubEnv("HUNCH_TIMING", "1");
    vi.mocked(sharpenHunch).mockResolvedValue({
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

    await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
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
});
