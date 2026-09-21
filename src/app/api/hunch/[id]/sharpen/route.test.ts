import { describe, expect, it, vi, beforeEach } from "vitest";

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
  NoStructuredOutput: class NoStructuredOutput extends Error {},
}));
vi.mock("@/lib/design-draft/predesign", () => ({ predesign: vi.fn() }));

const tx = {
  parameter: { deleteMany: vi.fn() },
  protocol: { deleteMany: vi.fn() },
  hunch: { update: vi.fn(async () => ({ id: "h1", hypothesis: {}, parameters: [] })) },
};
vi.mock("@/lib/db", () => ({
  db: {
    hunch: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  },
}));

import { POST } from "./route";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sharpenHunch, streamSharpenHunch } from "@/mastra/agents/hypothesis-coach";
import { predesign } from "@/lib/design-draft/predesign";
import { readNdjson } from "@/lib/ndjson";
import { SHARPEN_ERROR } from "@/lib/hunch-stream";

type Line = { partial?: unknown; done?: { hunch?: { id: string }; priors?: unknown[] }; error?: string };

async function lines(res: Response): Promise<Line[]> {
  const out: Line[] = [];
  for await (const line of readNdjson(res.body!)) out.push(line as Line);
  return out;
}

function coachStreams(sharpened: unknown, partials: unknown[] = []) {
  vi.mocked(streamSharpenHunch).mockImplementation(
    async (_raw, _priors, _answers, _observeOnly, onPartial) => {
      for (const p of partials) onPartial?.(p as never);
      return sharpened as never;
    },
  );
}

const req = (body: unknown) =>
  new Request("http://t/api/hunch/h1/sharpen", { method: "POST", body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: "h1" }) };

const sharpened = {
  statement: "Coffee after 2pm costs me sleep.",
  outcomeMetric: "hours of sleep",
  outcomeType: "continuous" as const,
  confounders: ["alcohol"],
  trackers: [],
};

/** Sharpened, nothing designed, nothing logged — a hunch on the confirm gate. */
const gate = { id: "h1", status: "sharpened", protocol: null, _count: { checkIns: 0 } };

describe("POST /api/hunch/[id]/sharpen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(db.hunch.findFirst).mockResolvedValue(gate as never);
    vi.mocked(sharpenHunch).mockResolvedValue(sharpened as never);
    // A test overriding `$transaction` (to reject) replaces its implementation
    // outright; `clearAllMocks` only clears call history, so without this the
    // override would bleed into whichever test runs next.
    vi.mocked(db.$transaction).mockImplementation((async (fn: (t: unknown) => unknown) =>
      fn(tx)) as never);
  });

  it("rejects a signed-out caller", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    expect((await POST(req({ rawText: "x" }), params)).status).toBe(401);
  });

  it("404s a hunch the user doesn't own", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(null as never);
    expect((await POST(req({ rawText: "x" }), params)).status).toBe(404);
  });

  it("re-sharpens the same hunch rather than creating a new one", async () => {
    coachStreams(sharpened);
    const res = await POST(req({ rawText: "coffee wrecks my sleep" }), params);
    await lines(res);
    expect(res.status).toBe(200);
    expect(tx.hunch.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "h1" } }),
    );
  });

  it("clears the parameters and protocol the old hypothesis owned", async () => {
    coachStreams(sharpened);
    const res = await POST(req({ rawText: "coffee wrecks my sleep" }), params);
    await lines(res);
    expect(tx.parameter.deleteMany).toHaveBeenCalledWith({ where: { hunchId: "h1" } });
    expect(tx.protocol.deleteMany).toHaveBeenCalledWith({ where: { hunchId: "h1" } });
  });

  it("refuses once days are logged", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...gate,
      _count: { checkIns: 3 },
    } as never);
    const res = await POST(req({ rawText: "x" }), params);
    expect(res.status).toBe(409);
    expect(tx.hunch.update).not.toHaveBeenCalled();
  });

  it("refuses once the trial has started", async () => {
    // The logged days are evidence about the old statement.
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...gate,
      protocol: { startedAt: new Date() },
    } as never);
    expect((await POST(req({ rawText: "x" }), params)).status).toBe(409);
    expect(tx.hunch.update).not.toHaveBeenCalled();
  });

  it("answers with an error line when the coach fails", async () => {
    vi.mocked(streamSharpenHunch).mockRejectedValue(new Error("model down"));
    const res = await POST(req({ rawText: "x" }), params);
    const got = await lines(res);
    expect(res.status).toBe(200);
    expect(got.at(-1)).toEqual({ error: SHARPEN_ERROR });
  });

  it("starts designing the re-sharpened hypothesis's plan", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(gate as never);
    coachStreams(sharpened);

    const res = await POST(req({ rawText: "coffee after 2pm", answers: [] }), params);
    await lines(res);

    expect(res.status).toBe(200);
    expect(after).toHaveBeenCalledTimes(1);
    // `after` also accepts a promise; the routes always pass a function.
    const scheduled = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
    await scheduled();
    expect(predesign).toHaveBeenCalledWith("h1");
  });

  it("designs nothing ahead when re-sharpening fails", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(gate as never);
    vi.mocked(streamSharpenHunch).mockRejectedValue(new Error("model down"));

    await lines(await POST(req({ rawText: "coffee after 2pm", answers: [] }), params));

    expect(after).not.toHaveBeenCalled();
  });

  it("streams the redo the same way the first sharpen streams", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(gate as never);
    coachStreams(sharpened, [{ statement: "Coffee after 2pm" }]);

    const res = await POST(req({ rawText: "coffee after 2pm wrecks sleep", answers: [] }), params);
    const got = await lines(res);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(got.map((l) => Object.keys(l)[0])).toEqual(["partial", "done"]);
    expect(got.at(-1)!.done!.hunch).toMatchObject({ id: "h1" });
  });

  it("answers a coach that throws with an error line", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(gate as never);
    vi.mocked(streamSharpenHunch).mockRejectedValue(new Error("bedrock down"));

    const res = await POST(req({ rawText: "coffee after 2pm wrecks sleep" }), params);

    expect(res.status).toBe(200);
    expect(await lines(res)).toEqual([{ error: SHARPEN_ERROR }]);
  });

  it("answers a failed transaction with an error line", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(gate as never);
    coachStreams(sharpened, [{ statement: "Coffee after 2pm" }]);
    vi.mocked(db.$transaction).mockRejectedValue(new Error("db down"));

    const got = await lines(await POST(req({ rawText: "coffee after 2pm" }), params));

    expect(got[0]).toHaveProperty("partial");
    expect(got.at(-1)).toEqual({ error: SHARPEN_ERROR });
  });

  it("keeps a log on JSON here too", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(gate as never);
    vi.mocked(sharpenHunch).mockResolvedValue(sharpened as never);

    const res = await POST(req({ rawText: "am I tired", observeOnly: true }), params);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(await res.json()).toHaveProperty("hunch");
    expect(streamSharpenHunch).not.toHaveBeenCalled();
  });

  it("still refuses a trial already under way, with no byte streamed", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...gate,
      _count: { checkIns: 3 },
    } as never);

    const res = await POST(req({ rawText: "coffee after 2pm" }), params);

    expect(res.status).toBe(409);
    expect(streamSharpenHunch).not.toHaveBeenCalled();
  });
});
