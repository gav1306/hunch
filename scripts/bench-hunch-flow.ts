/**
 * Dev-only: time the four waits a user sits through while making a hunch, end
 * to end against a running dev server, and split each into model time and
 * everything else.
 *
 *   W1  hunch typed -> clarify questions    POST /api/hunch/clarify
 *   W2  answers -> confirm gate             POST /api/hunch
 *   W3  confirm -> plan                     POST /api/hunch/[id]/protocol
 *   W4  first open of a finished trial      GET  /api/hunch/[id]/verdict
 *   control (no model call)                 GET  /api/hunch/[id]/belief
 *
 * The server must be started with timing on and the dev auth bypass, so every
 * request acts as `dev-user` and answers with a Server-Timing header:
 *
 *   DEV_AUTH_BYPASS=1 HUNCH_TIMING=1 npm run dev
 *   npx tsx scripts/bench-hunch-flow.ts [--runs 3] [--read-pause 8] [--base http://localhost:3000]
 *
 * --read-pause is how long a user spends on the confirm gate before W3. With
 * a pause the background design has usually finished (W3 "hit"); with 0 the
 * confirm waits on it ("wait"). "miss" means W3 designed inline without ever
 * finding a draft in progress; "wait+miss" means it waited on one, gave up,
 * and still designed inline — the double-wait a wait cap must stay under one
 * design's cost to avoid.
 *
 * W2 streams (spec 2026-09-20). Its client total is unchanged — the wait still
 * ends when the whole body has arrived — but two server-side readings moved:
 * `coach` is no longer in its Server-Timing, because the header is written
 * when the handler returns and the model runs after that, and W2's `total` now
 * measures only the time to build the streaming response. The number to read
 * for W2 is the client total, plus "first line", which is when the user stops
 * seeing a blank button. With HUNCH_TIMING=1 the server logs the coach's own
 * duration and token counts to its console.
 *
 * This spends real model calls: each run is four W1-W3 chains and two W4
 * verdicts. Everything the script creates is tracked and deleted before it
 * exits, Ctrl+C included; nothing it did not create is touched.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { db } from "../src/lib/db";
import { readEdges } from "../src/lib/memory/causal-graph";
import { selectCandidatePriors } from "../src/lib/memory/priors";
import { parseServerTiming, type TimingEntry } from "../src/lib/timing";
import {
  observationalDesign,
  protocolDesignSchema,
  type ProtocolDesign,
} from "../src/lib/schemas/protocol";
import { composeInstructions, fillPhaseDefaults } from "../src/mastra/agents/protocol-designer";
import { estimateTrialLength } from "../src/mastra/tools/power-analysis";

const DEV_USER = "dev-user";
const DAY = 86_400_000;
const MODEL_STEPS = ["recall", "clarifier", "coach", "designer", "safety", "analyst"];

// ---------------------------------------------------------------------------
// Arguments

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RUNS = Math.max(1, Number(arg("runs", "3")) || 1);
const BASE = arg("base", "http://localhost:3000").replace(/\/$/, "");
/** Seconds between W2 and W3, standing in for reading the confirm gate. */
const READ_PAUSE_MS = Math.max(0, Number(arg("read-pause", "8")) || 0) * 1000;

// ---------------------------------------------------------------------------
// Scenarios. Fixed texts, so every run asks the model the same thing.

type Shape = "phased" | "observational";
type UserType = "new" | "returning";

const SCENARIOS: Record<
  Shape,
  { text: string; priorCause: string; priorEffect: string }
> = {
  phased: {
    text: "skipping coffee after 2pm helps me sleep better",
    // The returning user's past finding. It only has to share words with the
    // hunch — `selectCandidatePriors` is a keyword overlap — so recall fires.
    priorCause: "No coffee after 2pm made my sleep better",
    priorEffect: "hours of sleep",
  },
  observational: {
    text: "playing basketball makes my knee hurt the next day",
    priorCause: "Playing basketball made my knee hurt more",
    priorEffect: "knee pain 1-5",
  },
};

// ---------------------------------------------------------------------------
// What gets recorded

type Wait = "W1" | "W2" | "W3" | "W4" | "control";

type Sample = {
  run: number;
  wait: Wait;
  scenario: string;
  status: number;
  clientMs: number;
  steps: TimingEntry[];
  /** Would `recallPriors` call the Memory agent? null where recall never runs. */
  recallWouldFire: boolean | null;
  note?: string;
};

const samples: Sample[] = [];

// ---------------------------------------------------------------------------
// Everything this script creates, so cleanup deletes exactly that.

const created = { hunchIds: new Set<string>(), edgeIds: new Set<string>() };
let stopping = false;
let cleaned = false;

async function cleanup(hunchIds = [...created.hunchIds], edgeIds = [...created.edgeIds]) {
  if (hunchIds.length === 0 && edgeIds.length === 0) return;
  // Edges carry no foreign key to their hunch, so the ones a verdict wrote for
  // our seeded trials are found by the hunch they came from. Only our own
  // hunch ids are ever in that list.
  const edges = await db.causalEdge.deleteMany({
    where: {
      userId: DEV_USER,
      OR: [{ id: { in: edgeIds } }, { sourceHunchId: { in: hunchIds } }],
    },
  });
  // Hypothesis, protocol, parameters, check-ins and verdict cascade.
  const hunches = await db.hunch.deleteMany({
    where: { userId: DEV_USER, id: { in: hunchIds } },
  });
  for (const id of hunchIds) created.hunchIds.delete(id);
  for (const id of edgeIds) created.edgeIds.delete(id);
  console.log(`  cleanup: deleted ${hunches.count} hunches, ${edges.count} causal edges`);
}

// A request already in flight may be about to create a row, so the first
// Ctrl+C lets it land (and be tracked) before cleaning up. A second one quits.
process.on("SIGINT", () => {
  if (stopping) {
    console.error("\nQuitting without cleanup. Tracked hunch ids:", [...created.hunchIds]);
    process.exit(130);
  }
  stopping = true;
  console.error("\nStopping after the request in flight, then cleaning up (Ctrl+C again to quit now)…");
});

class Stopped extends Error {}

function checkStop() {
  if (stopping) throw new Stopped();
}

// ---------------------------------------------------------------------------
// HTTP

type Timed<T> = {
  status: number;
  body: T;
  clientMs: number;
  /** When the first byte of the body arrived — the moment a streamed wait stops being blank. */
  firstByteMs?: number;
  steps: TimingEntry[];
  hasHeader: boolean;
};

/**
 * The last line of an NDJSON body, unwrapped.
 *
 * The sharpen routes stream `{"partial":…}` lines and end with exactly one
 * `{"done":…}` or `{"error":…}`, so what the bench wants is inside the final
 * line rather than in the body as a whole.
 */
function terminalNdjson(text: string): { done?: unknown; error?: unknown } | null {
  const lines = text.trim().split("\n").filter(Boolean);
  const last = lines.at(-1);
  if (!last) return null;
  try {
    const msg = JSON.parse(last) as { done?: unknown; error?: unknown };
    return msg.done !== undefined || msg.error !== undefined ? msg : null;
  } catch {
    return null;
  }
}

async function call<T = Record<string, unknown>>(
  method: "GET" | "POST",
  route: string,
  body?: unknown,
): Promise<Timed<T>> {
  const start = performance.now();
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // The wait ends when the client has the whole body, not the headers — but on
  // a streamed sharpen the first chunk is when the user stops seeing nothing,
  // so both readings are kept.
  let firstByteMs: number | undefined;
  let text = "";
  if (res.body) {
    const decoder = new TextDecoder();
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      firstByteMs ??= performance.now() - start;
      text += decoder.decode(chunk, { stream: true });
    }
    text += decoder.decode();
  }
  const clientMs = performance.now() - start;

  // Branch on the transport, not on whether JSON.parse throws: JSON.parse
  // tolerates the trailing newline NDJSON always ends with, so a body that is
  // exactly one line — a coach that throws before any partial, or a `done`
  // with none — parses as valid JSON and would never reach the NDJSON
  // handling below it. That's the common failure shape, so getting this
  // wrong makes the bench silently record a streamed failure as a success.
  let status = res.status;
  let parsed: unknown = text;
  const ndjson = (res.headers.get("content-type") ?? "").includes("ndjson");
  if (ndjson) {
    const terminal = terminalNdjson(text);
    if (terminal?.done !== undefined) parsed = terminal.done;
    else if (terminal?.error !== undefined) {
      // A streamed failure is the 502 this replaced; the rest of the script
      // counts it exactly as it always did.
      parsed = { error: terminal.error };
      status = 502;
    }
    // Otherwise left as text: a torn stream with no terminal line at all.
  } else {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Left as text: an HTML error page from Next, say.
    }
  }

  const header = res.headers.get("server-timing");
  return {
    status,
    body: parsed as T,
    clientMs,
    firstByteMs,
    steps: parseServerTiming(header),
    hasHeader: header !== null,
  };
}

function record(
  run: number,
  wait: Wait,
  scenario: string,
  r: Timed<unknown>,
  recallWouldFire: boolean | null,
  note?: string,
) {
  samples.push({ run, wait, scenario, status: r.status, clientMs: r.clientMs, steps: r.steps, recallWouldFire, note });
  const ok = r.status < 400 ? "" : ` (HTTP ${r.status}: ${errorOf(r.body)})`;
  console.log(`  ${wait.padEnd(7)} ${scenario.padEnd(24)} ${fmtMs(r.clientMs)}${ok}${note ? `  ${note}` : ""}`);
}

function errorOf(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) return String((body as { error: unknown }).error);
  return String(body).slice(0, 120);
}

// ---------------------------------------------------------------------------
// Preflight and warm-up

async function preflight() {
  let r: Timed<unknown>;
  try {
    r = await call("GET", "/api/hunch/bench-preflight/belief");
  } catch (err) {
    throw new Error(
      `Can't reach ${BASE} (${(err as Error).message}). Start the server first:\n` +
        "  DEV_AUTH_BYPASS=1 HUNCH_TIMING=1 npm run dev",
    );
  }
  if (r.status === 401) {
    throw new Error("The server answered 401 — start it with DEV_AUTH_BYPASS=1 (and not in production mode).");
  }
  if (!r.hasHeader) {
    throw new Error(
      `No Server-Timing header from ${BASE} (HTTP ${r.status}) — restart the server with HUNCH_TIMING=1.`,
    );
  }
}

/**
 * Turbopack compiles a route on its first hit. Each of these reaches the
 * route and leaves before any model call — a 400 for an empty body, a 404
 * for an id that doesn't exist — so the compile isn't in the first sample.
 */
async function warmUp() {
  const hits: Array<[string, Promise<Timed<unknown>>]> = [
    ["clarify", call("POST", "/api/hunch/clarify", { rawText: "" })],
    ["hunch", call("POST", "/api/hunch", { rawText: "" })],
    ["protocol", call("POST", "/api/hunch/bench-warmup/protocol", {})],
    ["verdict", call("GET", "/api/hunch/bench-warmup/verdict")],
    ["belief", call("GET", "/api/hunch/bench-warmup/belief")],
  ];
  for (const [name, hit] of hits) {
    const r = await hit;
    if (!r.hasHeader) throw new Error(`Warm-up of ${name} came back without Server-Timing (HTTP ${r.status}).`);
  }
}

// ---------------------------------------------------------------------------
// Recall: would it fire?

async function recallWouldFire(rawText: string): Promise<boolean> {
  const edges = await readEdges(DEV_USER);
  return selectCandidatePriors(edges, rawText).length > 0;
}

async function seedPrior(shape: Shape) {
  const s = SCENARIOS[shape];
  const source = await db.hunch.create({
    data: {
      userId: DEV_USER,
      rawText: `[bench] ${s.priorCause}`,
      status: "concluded",
      hypothesis: {
        create: { statement: s.priorCause, outcomeMetric: s.priorEffect, outcomeType: "continuous" },
      },
    },
  });
  created.hunchIds.add(source.id);
  const edge = await db.causalEdge.create({
    data: {
      userId: DEV_USER,
      cause: s.priorCause,
      effect: s.priorEffect,
      direction: "increases",
      effectSize: 0.8,
      confidence: 0.9,
      sourceHunchId: source.id,
    },
  });
  created.edgeIds.add(edge.id);
  return { hunchId: source.id, edgeId: edge.id };
}

// ---------------------------------------------------------------------------
// W1 -> W2 -> W3, one real chain

type Question = { id: string; prompt: string; options: string[] };
type ParameterDto = {
  label: string; type: string; unit?: string; min?: number; max?: number;
  isPrimary: boolean; isExposure: boolean;
};
type HunchBody = {
  hunch: { id: string; hypothesis: { schedulable: boolean }; parameters: ParameterDto[] };
  priors: unknown[];
};

async function chain(run: number, shape: Shape, user: UserType) {
  const scenario = `${shape}/${user}`;
  const { text } = SCENARIOS[shape];
  const fires = await recallWouldFire(text);

  checkStop();
  const w1 = await call<{ questions?: Question[]; priorIds?: string[] }>(
    "POST",
    "/api/hunch/clarify",
    { rawText: text },
  );
  record(run, "W1", scenario, w1, fires);
  if (w1.status !== 200 || !w1.body.questions) return;

  // Tap the first option on every question, as a hurried user would.
  const answers = w1.body.questions.map((q) => ({ id: q.id, prompt: q.prompt, answer: q.options[0] }));

  checkStop();
  // Forward clarify's recall the way the form does, so W2 times what users get.
  const w2 = await call<HunchBody>("POST", "/api/hunch", {
    rawText: text,
    answers,
    priorIds: w1.body.priorIds,
  });
  // 200 + NDJSON now, 201 + JSON for a log; either way the hunch is in the body.
  const hunch = w2.status < 400 && w2.body?.hunch ? w2.body.hunch : null;
  if (hunch) created.hunchIds.add(hunch.id);
  record(
    run, "W2", scenario, w2, fires,
    hunch
      ? `schedulable=${hunch.hypothesis.schedulable} priors=${w2.body.priors.length}` +
        (w2.firstByteMs !== undefined ? ` first line ${fmtMs(w2.firstByteMs)}` : "")
      : undefined,
  );
  if (!hunch) return;

  if (READ_PAUSE_MS > 0) await new Promise((resolve) => setTimeout(resolve, READ_PAUSE_MS));

  // Confirm the gate with the Coach's own drafts unchanged, exactly as the
  // client's confirm button sends them.
  checkStop();
  const w3 = await call<{ protocol?: { design?: { shape?: string }; safetyState?: string } }>(
    "POST",
    `/api/hunch/${hunch.id}/protocol`,
    {
      parameters: hunch.parameters.map((p) => ({
        label: p.label, type: p.type, unit: p.unit, min: p.min, max: p.max,
        isPrimary: p.isPrimary, isExposure: p.isExposure,
      })),
      schedulable: hunch.hypothesis.schedulable,
    },
  );
  record(
    run, "W3", scenario, w3, null,
    w3.body.protocol
      ? `design=${w3.body.protocol.design?.shape} safety=${w3.body.protocol.safetyState} draft=${draftOutcome(w3.steps)}`
      : undefined,
  );
}

// ---------------------------------------------------------------------------
// W4: a finished trial, seeded straight into the DB

function utcMidnightDaysAgo(n: number): Date {
  const t = new Date();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - n * DAY);
}

/** A little deterministic wobble, so the arms aren't flat lines. */
const wobble = (i: number) => Math.sin(i * 2.3) * 0.4;

/** An ABA trial built the way the Designer's own fallbacks build one. */
function phasedDesign(outcomeMetric: string): ProtocolDesign {
  const { minDaysPerPhase: days } = estimateTrialLength({ outcomeType: "continuous" });
  const phases = fillPhaseDefaults(
    [
      { label: "A", kind: "baseline", days },
      { label: "B", kind: "intervention", days },
      { label: "A", kind: "baseline", days },
    ],
    outcomeMetric,
  );
  const partial = { phases, washoutDays: 0, controls: [] };
  return protocolDesignSchema.parse({
    ...partial,
    instructions: composeInstructions(partial, outcomeMetric),
    shape: "phased",
  });
}

async function seedFinishedTrial(shape: Shape): Promise<string> {
  const observational = shape === "observational";
  const outcomeMetric = observational ? "knee pain 1-5" : "hours of sleep";
  const exposureLabel = "Played basketball";
  const design = observational ? observationalDesign(outcomeMetric, exposureLabel) : phasedDesign(outcomeMetric);
  const totalDays = design.phases.reduce((n, p) => n + p.days, 0);
  // Started far enough back that the last phase ended a few days ago.
  const startedAt = utcMidnightDaysAgo(totalDays + 3);

  const hunch = await db.hunch.create({
    data: {
      userId: DEV_USER,
      rawText: `[bench] ${SCENARIOS[shape].text}`,
      status: "running",
      hypothesis: {
        create: {
          statement: observational
            ? "Playing basketball makes my knee hurt the next day."
            : "Skipping coffee after 2pm helps me sleep longer.",
          outcomeMetric,
          outcomeType: "continuous",
          expectedDirection: "up",
          schedulable: !observational,
        },
      },
      parameters: {
        create: observational
          ? [
              { label: "Knee pain", type: "scale", unit: "1-5", min: 1, max: 5, isPrimary: true, sortOrder: 0 },
              { label: exposureLabel, type: "binary", isExposure: true, sortOrder: 1 },
            ]
          : [{ label: "Hours of sleep", type: "amount", unit: "hrs", min: 0, max: 24, isPrimary: true, sortOrder: 0 }],
      },
      protocol: {
        create: {
          design,
          powerInfo: estimateTrialLength({ outcomeType: "continuous" }),
          confounders: [],
          safetyState: "approved",
          startedAt,
        },
      },
    },
    include: { parameters: true },
  });
  created.hunchIds.add(hunch.id);

  const primary = hunch.parameters.find((p) => p.isPrimary)!;
  const exposure = hunch.parameters.find((p) => p.isExposure);

  // One check-in per day of the design, in the phase the calendar puts it in.
  const days: Array<{ phase: string; values: Array<{ parameterId: string; value: number }> }> = [];
  for (const phase of design.phases) {
    for (let d = 0; d < phase.days; d++) {
      const i = days.length;
      if (observational) {
        // Mixed yes/no: roughly two days in five, never a regular stripe.
        const played = i % 5 === 1 || i % 7 === 3;
        const pain = Math.min(5, Math.max(1, Math.round((played ? 3.4 : 1.8) + wobble(i) * 2)));
        days.push({
          phase: phase.label,
          values: [
            { parameterId: primary.id, value: pain },
            { parameterId: exposure!.id, value: played ? 1 : 0 },
          ],
        });
      } else {
        const sleep = (phase.kind === "intervention" ? 7.4 : 6.6) + wobble(i);
        days.push({ phase: phase.label, values: [{ parameterId: primary.id, value: Number(sleep.toFixed(2)) }] });
      }
    }
  }
  for (const [i, day] of days.entries()) {
    const loggedOn = new Date(startedAt.getTime() + i * DAY);
    await db.checkIn.create({
      data: {
        hunchId: hunch.id,
        phase: day.phase,
        loggedOn,
        loggedAt: new Date(loggedOn.getTime() + 9 * 3_600_000),
        values: { create: day.values },
      },
    });
  }
  return hunch.id;
}

async function finishedTrial(run: number, shape: Shape) {
  const id = await seedFinishedTrial(shape);
  checkStop();
  // Only the first GET runs the Analyst; every later one reads the stored row.
  const verdict = await call<{ verdict?: { category?: string } }>("GET", `/api/hunch/${id}/verdict`);
  record(run, "W4", shape, verdict, null, verdict.body.verdict ? `category=${verdict.body.verdict.category}` : undefined);
  checkStop();
  const belief = await call("GET", `/api/hunch/${id}/belief`);
  record(run, "control", shape, belief, null, "belief");
}

// ---------------------------------------------------------------------------
// Summary

const median = (xs: number[]) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const fmtMs = (ms: number) => (Number.isNaN(ms) ? "-" : ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`);

/** "designer-2" is still the designer. */
const baseName = (name: string) => name.replace(/-\d+$/, "");

/** What W3 got from the background design, read off its Server-Timing steps. */
function draftOutcome(steps: TimingEntry[]): "hit" | "wait" | "miss" | "wait+miss" | "-" {
  const draft = steps.find((e) => e.name === "draft");
  if (!draft) return "-";
  if (steps.some((e) => e.name === "designer" || e.name === "safety")) {
    return draft.dur > 1000 ? "wait+miss" : "miss";
  }
  return draft.dur > 250 ? "wait" : "hit";
}

function printTable() {
  const groups = new Map<string, Sample[]>();
  for (const s of samples) {
    const key = `${s.wait}\t${s.scenario}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  const header = ["wait", "scenario", "recall", "ok/n", "client med", "client worst", "server med", "model med", "overhead med", "steps (median dur, in/out tokens)"];
  const rows: string[][] = [];
  for (const [key, group] of groups) {
    const [wait, scenario] = key.split("\t");
    const fired = group.map((s) => s.recallWouldFire);
    const recall = fired[0] === null ? "-" : fired.every(Boolean) ? "fires" : fired.some(Boolean) ? "mixed" : "no";
    const ok = group.filter((s) => s.status < 400);

    const modelSum = (s: Sample) =>
      s.steps.filter((e) => MODEL_STEPS.includes(baseName(e.name))).reduce((n, e) => n + e.dur, 0);
    const serverTotal = (s: Sample) => s.steps.find((e) => e.name === "total")?.dur ?? NaN;

    // Step order as the server reported it, across every run.
    const names: string[] = [];
    for (const s of group) for (const e of s.steps) if (e.name !== "total" && !names.includes(e.name)) names.push(e.name);
    const steps = names
      .map((name) => {
        const hits = group.flatMap((s) => s.steps.filter((e) => e.name === name));
        const ins = hits.map((e) => e.inputTokens).filter((n): n is number => n !== undefined);
        const outs = hits.map((e) => e.outputTokens).filter((n): n is number => n !== undefined);
        const tokens = ins.length || outs.length ? ` ${ins.length ? median(ins) : "?"}/${outs.length ? median(outs) : "?"}` : "";
        return `${name} ${fmtMs(median(hits.map((e) => e.dur)))}${tokens}`;
      })
      .join(" · ");

    rows.push([
      wait,
      scenario,
      recall,
      `${ok.length}/${group.length}`,
      fmtMs(median(group.map((s) => s.clientMs))),
      fmtMs(Math.max(...group.map((s) => s.clientMs))),
      fmtMs(median(group.map(serverTotal))),
      fmtMs(median(group.map(modelSum))),
      fmtMs(median(group.map((s) => s.clientMs - modelSum(s)))),
      steps || "-",
    ]);
  }

  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join("  ");
  console.log(`\n${line(header)}`);
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
  console.log(
    "\nrecall: whether selectCandidatePriors had candidates, i.e. the Memory agent was called." +
      "\nmodel = sum of model steps; overhead = client total - model (DB, auth, Next, network)." +
      "\nMedians over all samples, failed requests included; ok/n counts HTTP < 400.",
  );
}

function writeResults(startedAt: Date) {
  const dir = path.join(__dirname, ".bench-results");
  mkdirSync(dir, { recursive: true });
  // Colons out of the timestamp, so the name is a valid path everywhere.
  const file = path.join(dir, `${startedAt.toISOString().replace(/:/g, "-")}.json`);
  writeFileSync(file, JSON.stringify({ base: BASE, runs: RUNS, startedAt, samples }, null, 2));
  console.log(`\nRaw samples: ${path.relative(process.cwd(), file)}`);
}

// ---------------------------------------------------------------------------

async function main() {
  const startedAt = new Date();
  await preflight();
  console.log(`Server at ${BASE} is timing requests. Warming up routes…`);
  await warmUp();

  const shapes: Shape[] = ["phased", "observational"];

  try {
    for (let run = 1; run <= RUNS; run++) {
      console.log(`\nRun ${run}/${RUNS}`);

      for (const shape of shapes) {
        const fires = await recallWouldFire(SCENARIOS[shape].text);
        if (fires) console.log(`  note: dev-user's existing edges already make "${shape}/new" call recall`);
        await chain(run, shape, "new");
      }

      // The returning user's past findings exist only for these chains, and
      // go before W4 so the next run's "new" user is new again.
      const seeds = await Promise.all(shapes.map(seedPrior));
      try {
        for (const shape of shapes) await chain(run, shape, "returning");
      } finally {
        await cleanup(seeds.map((s) => s.hunchId), seeds.map((s) => s.edgeId));
      }

      for (const shape of shapes) await finishedTrial(run, shape);
      // The verdicts just wrote edges from these trials' statements; clearing
      // them now keeps them out of the next run's recall.
      await cleanup();
    }
  } catch (err) {
    if (!(err instanceof Stopped)) throw err;
  } finally {
    await cleanup();
    cleaned = true;
  }

  if (samples.length) {
    printTable();
    writeResults(startedAt);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!cleaned && (created.hunchIds.size || created.edgeIds.size)) await cleanup().catch(console.error);
    await db.$disconnect();
    if (stopping) process.exit(130);
  });
