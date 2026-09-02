import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/db", () => ({ db: { hunch: { findFirst: vi.fn() } } }));

import { GET } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const params = { params: Promise.resolve({ id: "h1" }) };
const req = (query = "") =>
  new Request(`http://t/api/hunch/h1/export${query}`);

/**
 * A concluded hunch as Prisma hands it back — the shape the route has to fold
 * into an `ExportHunch`. Every number here is distinct so a mapping that
 * crosses two fields (`ciLow`/`ciHigh`, `nA`/`nB`) shows up in the output
 * rather than cancelling itself out.
 */
const row = {
  id: "h1",
  rawText: "does coffee after lunch wreck my sleep",
  hypothesis: {
    statement: "Coffee after 2pm reduces my sleep quality.",
    outcomeMetric: "sleep quality",
  },
  protocol: { startedAt: new Date("2026-07-01T00:00:00.000Z") },
  verdict: {
    category: "hurt",
    narrative: "Sleep was worse on the coffee days.",
    pEffect: 0.93,
    effect: -1.234,
    ciLow: -2.5,
    ciHigh: -0.25,
    nA: 11,
    nB: 13,
  },
  parameters: [
    { id: "p1", label: "sleep quality", unit: "1-10", sortOrder: 0, isPrimary: true },
    { id: "p2", label: "caffeine", unit: null, sortOrder: 1, isPrimary: false },
  ],
  checkIns: [
    {
      loggedOn: new Date("2026-07-01T00:00:00.000Z"),
      phase: "A",
      values: [
        { parameterId: "p1", value: 7 },
        { parameterId: "p2", value: 0 },
      ],
    },
    {
      loggedOn: new Date("2026-07-02T00:00:00.000Z"),
      phase: "B",
      values: [{ parameterId: "p1", value: 4 }],
    },
  ],
};

describe("GET /api/hunch/[id]/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(db.hunch.findFirst).mockResolvedValue(row as never);
  });

  it("rejects a signed-out caller", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    expect((await GET(req(), params)).status).toBe(401);
    expect(db.hunch.findFirst).not.toHaveBeenCalled();
  });

  it("404s a hunch the user doesn't own", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(null as never);
    expect((await GET(req(), params)).status).toBe(404);
  });

  it("404s a hunch that was never sharpened", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({ ...row, hypothesis: null } as never);
    expect((await GET(req(), params)).status).toBe(404);
  });

  it("scopes the read to the caller and keeps the rows in order", async () => {
    await GET(req(), params);
    const arg = vi.mocked(db.hunch.findFirst).mock.calls[0][0] as {
      where: { id: string; userId: string };
      include: {
        parameters: { orderBy: { sortOrder: "asc" } };
        checkIns: { orderBy: { loggedOn: "asc" } };
      };
    };
    expect(arg.where).toEqual({ id: "h1", userId: "u1" });
    // Column order and row order are both load-bearing in the CSV.
    expect(arg.include.parameters.orderBy).toEqual({ sortOrder: "asc" });
    expect(arg.include.checkIns.orderBy).toEqual({ loggedOn: "asc" });
  });

  it("defaults to CSV and maps every logged day onto its parameter column", async () => {
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="coffee-after-2pm-reduces-my-sleep-quality.csv"',
    );
    expect(await res.text()).toBe(
      [
        "date,phase,sleep quality (1-10),caffeine",
        "2026-07-01,A,7,0",
        // Day two logged only the primary parameter; its column stays empty.
        "2026-07-02,B,4,",
        "",
      ].join("\n"),
    );
  });

  it("treats an unknown format as CSV", async () => {
    const res = await GET(req("?format=pdf"), params);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
  });

  it("renders the verdict as text with the interval the right way round", async () => {
    const res = await GET(req("?format=txt"), params);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toContain(".txt");

    const body = await res.text();
    expect(body).toContain("Hypothesis: Coffee after 2pm reduces my sleep quality.");
    expect(body).toContain("Outcome measured: sleep quality");
    expect(body).toContain("Started: 2026-07-01");
    // Direction and the primary parameter's own name — never "it hurt", which
    // would be a value judgement the engine has no basis for.
    expect(body).toContain("Sleep quality went down — 93% sure");
    // ciLow then ciHigh, nA then nB: the two pairs a mapping slip would swap.
    expect(body).toContain(
      "Effect: -1.23 (95% credible interval -2.50 to -0.25); 11 baseline days, 13 intervention days.",
    );
  });

  it("exports a running hunch that has no verdict yet", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({ ...row, verdict: null } as never);
    const body = await (await GET(req("?format=txt"), params)).text();
    expect(body).toContain("No verdict yet");
  });

  it("says the experiment is unstarted when there is no protocol", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({ ...row, protocol: null } as never);
    const body = await (await GET(req("?format=txt"), params)).text();
    expect(body).toContain("Started: not started");
  });
});
