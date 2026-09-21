# Streaming the Coach — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream the Hypothesis Coach's output to the new-hunch form as it is written, so the 4.1–11.6s sharpen wait shows the hypothesis appearing instead of a button reading "Sharpening…".

**Architecture:** Both sharpen routes answer with newline-delimited JSON over a plain `ReadableStream` instead of a single JSON body. A new `streamSharpenHunch` calls `hypothesisCoach.stream(...)` with the same prompt, schema and token cap as `sharpenHunch`, and hands each partial object to a callback; a shared `sharpenStreamResponse` helper turns those callbacks into `{"partial":…}` lines and ends with exactly one `{"done":…}` or `{"error":…}` line. Everything before the model call — auth, empty input, the medication refusal — is untouched and keeps its real HTTP status, because it runs before the first byte. The client hook reads the lines back, feeds partials to the form and resolves the same `HunchWithHypothesis` it resolves today.

**Tech Stack:** Next.js 16 App Router, Mastra `@mastra/core` 1.36.0 (`agent.stream(...).objectStream`), Zod v4, TanStack Query 5, Prisma/Postgres, Vitest 4 (node environment), `tsx` for the bench script.

**Spec:** `docs/superpowers/specs/2026-09-20-coach-stream-design.md`

## Global Constraints

- **No new dependencies** (RULES.md §1). NDJSON over `fetch` + `ReadableStream`, no `ai` package, no SSE.
- **Nothing before the first byte changes.** Auth 401, empty-input 400 and the medication 422 stay JSON responses with those exact statuses, and `BlockedHunchError` keeps working unchanged.
- **`observeOnly: true` stays on JSON on both routes.** Its `diaryFallback` path and every test of it are untouched — that is the point of the carve-out.
- **Exactly one terminal line, always:** `{"done":…}` or `{"error":…}`, never both, never neither (a dropped connection aside, which the client treats as an error).
- **One error message, everywhere:** `"Couldn't sharpen your hunch right now. Please try again in a moment."` — the same string the 502 carries today, exported as `SHARPEN_ERROR`.
- **The `done` payload is today's 201 body, field for field:** `{ hunch: { …hunch, parameters: parameters.map(toParameterDto) }, priors }`. Nothing downstream of the response changes.
- **Streamed responses are HTTP 200,** not 201: the status is chosen before the row exists. `observeOnly`'s JSON stays 201 on create and 200 on redo.
- **`sharpenHunch` is not modified.** `streamSharpenHunch` is a sibling; they share `buildSharpenPrompt`, `sharpenedHypothesisObjectSchema`, `normaliseSchedulability` and `maxOutputTokens: 1024`.
- **No `timed("coach")` on the streaming path.** The `Server-Timing` header is written when the handler returns, which is before the model runs. The stream body runs inside `untimed` so its steps never land in a header that has already gone out. W2's client total is unchanged; its model attribution moves out of the header — that is expected, not a regression.
- **Test-first** (RULES.md §3). Every test here mocks the model and the DB. Only Task 9 spends OpenRouter credits.
- **Vitest runs in the `node` environment** with `include: ["src/**/*.test.ts"]`. There is no jsdom and no React Testing Library, so the form (Task 7) is verified by typecheck, lint and a live run — not by a unit test. Anything that needs a test gets extracted into a plain module first.
- **The owner commits** (RULES.md §2). Each task ends green — `npm test`, `npm run typecheck`, `npm run lint` — and reports "ready to commit" with the Conventional Commits message given. **No commit trailers.**

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/ndjson.ts` (create) | `ndjsonLine`, `readNdjson` — one JSON object per line, both ends of the wire |
| `src/lib/ndjson.test.ts` (create) | line splitting, chunk boundaries, trailing line |
| `src/lib/hunch-stream.ts` (create) | `SHARPEN_ERROR`, `sharpenStreamResponse` — the route's side: partial lines, one terminal line |
| `src/lib/hunch-stream.test.ts` (create) | terminal-line discipline, failure after the first byte |
| `src/mastra/agents/hypothesis-coach.ts` (modify) | add `streamSharpenHunch` next to `sharpenHunch` |
| `src/lib/schemas/hypothesis.ts` (modify) | comment: field order is what the user watches arrive |
| `src/app/api/hunch/route.ts` (modify) | stream unless `observeOnly` |
| `src/app/api/hunch/[id]/sharpen/route.ts` (modify) | same, for redo |
| `src/hooks/use-create-hunch.ts` (modify) | read the lines back; `onPartial`; export `postHunch` for tests |
| `src/hooks/use-create-hunch.test.ts` (create) | the client's line handling, blocked + observe-only JSON paths |
| `src/components/hunch/new-hunch-form.tsx` (modify) | render the partial hypothesis while it is being written |
| `scripts/bench-hunch-flow.ts` (modify) | read NDJSON, report time to first line, treat an error line as a 502 |
| `src/mastra/agents/hypothesis-coach.eval.test.ts` (modify) | one eval: the streamed path agrees with the generated one |

---

### Task 1: NDJSON, both ends

**Files:**
- Create: `src/lib/ndjson.ts`
- Test: `src/lib/ndjson.test.ts`

**Interfaces:**
- Produces: `export function ndjsonLine(value: unknown): string` — `JSON.stringify(value)` plus `"\n"`.
- Produces: `export async function* readNdjson(stream: ReadableStream<Uint8Array>): AsyncGenerator<unknown>` — yields one parsed value per line, tolerating a chunk boundary anywhere, including mid-line and mid-character. Throws `SyntaxError` on a malformed line (callers decide what that means).

- [ ] **Step 1: Write the failing test**

Create `src/lib/ndjson.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ndjsonLine, readNdjson } from "./ndjson";

/** A stream that hands out exactly these chunks, so a test can place the seams. */
function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const value of readNdjson(stream)) out.push(value);
  return out;
}

describe("ndjsonLine", () => {
  it("writes one JSON object per line", () => {
    expect(ndjsonLine({ partial: { statement: "Coffee" } })).toBe(
      '{"partial":{"statement":"Coffee"}}\n',
    );
  });
});

describe("readNdjson", () => {
  it("yields every line of a chunk in order", async () => {
    const values = await collect(streamOf('{"a":1}\n{"a":2}\n'));
    expect(values).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("reassembles a line split across two chunks", async () => {
    const values = await collect(streamOf('{"statement":"Coffee after lun', 'ch"}\n'));
    expect(values).toEqual([{ statement: "Coffee after lunch" }]);
  });

  it("yields a final line that never got its newline", async () => {
    const values = await collect(streamOf('{"a":1}\n{"a":2}'));
    expect(values).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("skips blank lines rather than parsing them", async () => {
    const values = await collect(streamOf('\n{"a":1}\n\n'));
    expect(values).toEqual([{ a: 1 }]);
  });

  it("survives a multi-byte character split across chunks", async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('{"s":"café"}\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Straight through the two bytes of "é".
        controller.enqueue(bytes.slice(0, 10));
        controller.enqueue(bytes.slice(10));
        controller.close();
      },
    });
    expect(await collect(stream)).toEqual([{ s: "café" }]);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/ndjson.test.ts`
Expected: FAIL — `Failed to resolve import "./ndjson"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/ndjson.ts`:

```ts
/**
 * Newline-delimited JSON: one complete JSON value per line.
 *
 * The sharpen routes answer with a stream of these rather than one body, so
 * the user watches the hypothesis being written instead of watching a button
 * for up to 11.5s. Server-Sent Events would have been the obvious transport,
 * but `EventSource` is GET-only and sharpening is a POST with a body — and
 * `fetch` already hands the client a reader.
 *
 * Used by both ends: the routes write with `ndjsonLine`, the client hook and
 * the bench read with `readNdjson`.
 */

/** One value, serialised as a line. */
export function ndjsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

/**
 * Read a body back into the values that were written to it.
 *
 * A chunk boundary can fall anywhere — mid-line, or between the two bytes of
 * a "é" — so the remainder is buffered and the decoder is kept in streaming
 * mode. Blank lines are skipped; a malformed one throws, which callers treat
 * as a torn stream.
 */
export async function* readNdjson(stream: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (let nl = buffer.indexOf("\n"); nl !== -1; nl = buffer.indexOf("\n")) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) yield JSON.parse(line);
      }
    }
    // Flush the decoder, then whatever line never got its newline.
    const tail = (buffer + decoder.decode()).trim();
    if (tail) yield JSON.parse(tail);
  } finally {
    reader.releaseLock();
  }
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/lib/ndjson.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Green the gate and report ready to commit**

Run: `npm test && npm run typecheck && npm run lint`
Suggested message:

```
feat(stream): read and write newline-delimited JSON
```

---

### Task 2: The Coach's streaming sibling

**Files:**
- Modify: `src/mastra/agents/hypothesis-coach.ts` (append after `sharpenHunch`)
- Modify: `src/lib/schemas/hypothesis.ts` (comment on `sharpenedHypothesisObjectSchema`)
- Test: `src/mastra/agents/hypothesis-coach.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `export async function streamSharpenHunch(rawText: string, priors?: Prior[], answers?: ClarifyingAnswer[], observeOnly?: boolean, onPartial?: (partial: Partial<SharpenedHypothesisDraft>) => void): Promise<SharpenedHypothesis>` — same arguments as `sharpenHunch` plus a callback, same validated return value. Throws `NoStructuredOutput` when the model never completes an object.

- [ ] **Step 1: Write the failing test**

In `src/mastra/agents/hypothesis-coach.test.ts`, extend the `Agent` stub at the top of the file to carry a `stream` method:

```ts
vi.mock("@mastra/core/agent", () => ({
  Agent: class {
    generate = vi.fn();
    stream = vi.fn();
  },
}));
```

Add `streamSharpenHunch` to the import from `@/mastra/agents/hypothesis-coach`, and append:

```ts
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

    const [prompt, options] = vi.mocked(hypothesisCoach.stream).mock.calls[0] as [
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
```

Add to that file's imports: `NoStructuredOutput` and `sharpenedHypothesisObjectSchema`.

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/mastra/agents/hypothesis-coach.test.ts`
Expected: FAIL — `streamSharpenHunch is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/mastra/agents/hypothesis-coach.ts`:

```ts
/**
 * The Coach, streamed. Same prompt, same schema, same token cap as
 * `sharpenHunch` — the difference is only that the caller sees the object
 * being assembled instead of waiting for it.
 *
 * It does not make the Coach faster: the same tokens take the same time.
 * Latency here is very nearly a readout of output length (~2.2s plus ~8.5ms
 * per token), so the app cannot know whether it is handing the user a 4s wait
 * or an 11.5s one. Streaming makes that wait legible.
 *
 * Deliberately NOT wrapped in `timed("coach", …)`: the caller has already
 * returned its response, so the `Server-Timing` header this would write into
 * has gone out. With timing on the run logs its own line instead.
 */
export async function streamSharpenHunch(
  rawText: string,
  priors: Prior[] = [],
  answers: ClarifyingAnswer[] = [],
  observeOnly = false,
  onPartial: (partial: Partial<SharpenedHypothesisDraft>) => void = () => {},
): Promise<SharpenedHypothesis> {
  const start = performance.now();
  const stream = await hypothesisCoach.stream(
    buildSharpenPrompt(rawText, priors, answers, observeOnly),
    {
      // The unrefined shape, for the same reason `sharpenHunch` uses it:
      // Mastra validates with the refinements too, so the refined schema would
      // throw on "unschedulable, no yes/no" before normaliseSchedulability
      // below could repair it.
      structuredOutput: { schema: sharpenedHypothesisObjectSchema },
      modelSettings: { maxOutputTokens: 1024 },
    },
  );

  // Partials arrive in the schema's field order — statement first, trackers
  // last. See the note on `sharpenedHypothesisObjectSchema`.
  for await (const partial of stream.objectStream) {
    onPartial(partial as Partial<SharpenedHypothesisDraft>);
  }

  // A refusal reaches us as a stream that produced prose and no object; the
  // underlying rejection says nothing useful about why. Same error type the
  // generated path throws, so the observe-only fallback still recognises it.
  const object = await stream.object.catch(() => undefined);
  if (!object) throw new NoStructuredOutput();

  if (process.env.HUNCH_TIMING === "1") {
    const usage = await stream.totalUsage.catch(() => undefined);
    console.log(
      `[timing] coach (streamed) dur=${(performance.now() - start).toFixed(1)} ` +
        `in=${usage?.inputTokens ?? "?"} out=${usage?.outputTokens ?? "?"}`,
    );
  }

  return sharpenedHypothesisSchema.parse(normaliseSchedulability(object));
}
```

Then add the field-order note to `src/lib/schemas/hypothesis.ts`, at the end of the docblock above `sharpenedHypothesisObjectSchema` (just before `export const sharpenedHypothesisObjectSchema`):

```
 * The FIELD ORDER below is load-bearing. The Coach streams this object a field
 * at a time, so the order here is the order the user watches it appear:
 * statement first, then the outcome, with the trackers last. Reordering these
 * would silently change what the new-hunch form shows while it waits.
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/mastra/agents/hypothesis-coach.test.ts`
Expected: PASS — the five new tests plus the existing ones.

- [ ] **Step 5: Green the gate and report ready to commit**

Run: `npm test && npm run typecheck && npm run lint`
Suggested message:

```
feat(coach): stream the hypothesis as the model writes it
```

---

### Task 3: The route's side of the stream

**Files:**
- Create: `src/lib/hunch-stream.ts`
- Test: `src/lib/hunch-stream.test.ts`

**Interfaces:**
- Consumes: `ndjsonLine` from `@/lib/ndjson`; `readNdjson` in the test.
- Produces: `export const SHARPEN_ERROR: string` — the one message both routes use, streamed or not.
- Produces: `export function sharpenStreamResponse(run: (emit: (partial: unknown) => void) => Promise<unknown>, options: { label: string }): Response` — a 200 whose body is `{"partial":…}` lines followed by exactly one `{"done":…}` (the resolved value) or `{"error":SHARPEN_ERROR}` (it threw). `label` only names the route in the server log.

- [ ] **Step 1: Write the failing test**

Create `src/lib/hunch-stream.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/lib/hunch-stream.test.ts`
Expected: FAIL — `Failed to resolve import "./hunch-stream"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/hunch-stream.ts`:

```ts
import { ndjsonLine } from "@/lib/ndjson";
import { untimed } from "@/lib/timing";

/**
 * The one thing the app says when sharpening fails, whichever road it takes.
 * Before streaming this was a 502's body; once a byte has been written the
 * status is spent, so it arrives as the stream's last line instead.
 */
export const SHARPEN_ERROR =
  "Couldn't sharpen your hunch right now. Please try again in a moment.";

/**
 * Answer a sharpen with a stream of newline-delimited JSON.
 *
 * `run` does the work and returns the payload the route would have returned
 * today; whatever it passes to `emit` goes out as a `{"partial":…}` line on
 * the way. The body always ends with exactly one terminal line — `{"done":…}`
 * or `{"error":…}` — so the client never has to guess whether a stream that
 * stopped was finished or broken.
 *
 * This is 2e6c5ad's lesson ("answer a failed design with a message, not a bare
 * 500") applied to a second route: past the first byte a 502 is no longer
 * available, so the failure has to travel in the body.
 *
 * `untimed` because the `Server-Timing` header was written when the handler
 * returned this Response, which is before `run` has done anything. Steps
 * recorded in here would be pushed into a header that has already gone out.
 */
export function sharpenStreamResponse(
  run: (emit: (partial: unknown) => void) => Promise<unknown>,
  { label }: { label: string },
): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      // The reader can go away mid-stream (a closed tab, a refresh). Enqueuing
      // to a dead controller throws, and doing it from the catch below would
      // throw out of `start` — so a write that fails simply ends the writing.
      let open = true;
      const write = (value: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(ndjsonLine(value)));
        } catch {
          open = false;
        }
      };

      try {
        const done = await untimed(() => run((partial) => write({ partial })));
        write({ done });
      } catch (err) {
        console.error(`[${label}] sharpen failed:`, err);
        write({ error: SHARPEN_ERROR });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a failed write, or by the reader going away.
        }
      }
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // A buffered response is a slower version of what this replaces.
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/lib/hunch-stream.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Green the gate and report ready to commit**

Run: `npm test && npm run typecheck && npm run lint`
Suggested message:

```
feat(stream): answer a sharpen with partial lines and one terminal line
```

---

### Task 4: `POST /api/hunch` streams

**Files:**
- Modify: `src/app/api/hunch/route.ts`
- Test: `src/app/api/hunch/route.test.ts`

**Interfaces:**
- Consumes: `sharpenStreamResponse`, `SHARPEN_ERROR` (Task 3); `streamSharpenHunch` (Task 2); `readNdjson` (Task 1, test only).
- Produces: `POST /api/hunch` answering `200 application/x-ndjson` for a trial, and an unchanged `201 application/json` when `observeOnly: true`. Guard statuses (401 / 400 / 422) unchanged.

- [ ] **Step 1: Write the failing test**

In `src/app/api/hunch/route.test.ts`, widen the coach mock and add the drain helper.

Replace the coach mock line with:

```ts
vi.mock("@/mastra/agents/hypothesis-coach", () => ({
  sharpenHunch: vi.fn(),
  streamSharpenHunch: vi.fn(),
  // The route does `err instanceof NoStructuredOutput` on the observe-only path.
  NoStructuredOutput: class NoStructuredOutput extends Error {},
}));
```

Add to the imports:

```ts
import { streamSharpenHunch } from "@/mastra/agents/hypothesis-coach";
import { readNdjson } from "@/lib/ndjson";
import { SHARPEN_ERROR } from "@/lib/hunch-stream";
```

And below `req`:

```ts
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
```

Now update the three existing non-`observeOnly` tests to drain the stream, and add the new ones.

Change `"persists the outcome as the primary parameter plus the proposed trackers"` to call `coachStreams({...})` instead of `vi.mocked(sharpenHunch).mockResolvedValue({...})`, and replace its `expect(res.status).toBe(201)` with:

```ts
    const got = await lines(res);
    expect(res.status).toBe(200);
    expect(got.at(-1)).toHaveProperty("done");
```

Change `"reuses the priors clarify already recalled for this text"` the same way, draining with `await lines(res)` before the `expect(recallPriors)` assertion — the recall now happens inside the stream:

```ts
    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [], priorIds: ["h_caf"] }));
    await lines(res);

    expect(recallPriors).toHaveBeenCalledWith("u1", "coffee wrecks sleep", ["h_caf"]);
```

Replace `"502s when the coach throws"` with:

```ts
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
```

That test needs `sharpenedHypothesisSchema` in the file's imports:

```ts
import { sharpenedHypothesisSchema } from "@/lib/schemas/hypothesis";
```

Update `"starts designing the new hunch's plan once it is saved"` and `"keeps the scheduled design untimed…"` to use `coachStreams(...)` and to `await lines(res)` before asserting on `after`. Update `"designs nothing ahead when sharpening fails or is refused"` to reject `streamSharpenHunch` and drain the first response.

Then append the genuinely new tests:

```ts
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
    vi.mocked(recallPriors).mockResolvedValue([{ cause: "caffeine", direction: "up", confidence: 0.8 }] as never);
    vi.mocked(db.hunch.create).mockResolvedValue({
      id: "h1",
      rawText: "coffee wrecks sleep",
      status: "sharpened",
      hypothesis: { id: "hy1", statement: "Coffee after lunch makes me sleep worse." },
      parameters: [],
    } as never);

    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
    const done = (await lines(res)).at(-1)!.done!;

    expect(done.hunch).toMatchObject({ id: "h1", status: "sharpened" });
    expect(done.hunch).toHaveProperty("parameters");
    expect(done.priors).toHaveLength(1);
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/app/api/hunch/route.test.ts`
Expected: FAIL — the route still answers `201 application/json`, and `res.body` has no NDJSON lines.

- [ ] **Step 3: Write the implementation**

Replace the body of `createHunch` in `src/app/api/hunch/route.ts` (everything from `try {` to the end of the function) with the following, and update the imports at the top to add `SHARPEN_ERROR`, `sharpenStreamResponse` and `streamSharpenHunch`:

```ts
import { SHARPEN_ERROR, sharpenStreamResponse } from "@/lib/hunch-stream";
import {
  NoStructuredOutput,
  sharpenHunch,
  streamSharpenHunch,
} from "@/mastra/agents/hypothesis-coach";
```

```ts
  const { rawText, answers, priorIds, observeOnly } = parsed.data;

  /**
   * Persist the sharpened hunch with the parameter set the confirm gate will
   * edit, and build the body both roads out of here return.
   */
  async function persist(sharpened: SharpenedHypothesis, priors: Prior[]) {
    const drafts = draftsFromSharpened(sharpened);

    const hunch = await db.hunch.create({
      data: {
        userId: session!.user.id,
        rawText,
        status: "sharpened",
        hypothesis: {
          create: {
            statement: sharpened.statement,
            outcomeMetric: sharpened.outcomeMetric,
            expectedDirection: sharpened.expectedDirection ?? null,
            subject: sharpened.subject,
            outcomeType: sharpened.outcomeType,
            confounders: sharpened.confounders,
            schedulable: sharpened.schedulable,
          },
        },
        // The proposed set the confirm gate edits. Persisted now so a reload
        // of the protocol page still shows the trackers the Coach suggested.
        parameters: {
          create: drafts.map((d, i) => ({
            label: d.label,
            type: d.type,
            unit: d.unit ?? null,
            min: d.min ?? null,
            max: d.max ?? null,
            isPrimary: d.isPrimary,
            isExposure: d.isExposure ?? false,
            sortOrder: i,
          })),
        },
      },
      include: { hypothesis: true, parameters: { orderBy: { sortOrder: "asc" } } },
    });

    // Design the plan while the user reads the confirm gate; confirm takes it
    // if nothing it depends on changed. A log never gets a designed plan.
    // `after()` is still available from inside the streaming body — the request
    // is open until the stream closes — but a hunch that is already saved must
    // not fail over scheduling, so a refusal falls back to running it detached.
    if (!observeOnly) {
      try {
        after(() => untimed(() => predesign(hunch.id)));
      } catch (err) {
        console.warn("[hunch] after() unavailable, pre-designing detached:", err);
        void untimed(() => predesign(hunch.id)).catch(() => {});
      }
    }

    return { hunch: { ...hunch, parameters: hunch.parameters.map(toParameterDto) }, priors };
  }

  // A log stays on JSON. It is the one path whose visible output can be thrown
  // away and replaced — the model returns prose, `sharpenHunch` throws, and
  // `diaryFallback` writes the hypothesis from the user's own words — so
  // streaming it would mean streaming text the app is about to discard.
  if (observeOnly) {
    try {
      const priors = await recallPriors(session.user.id, rawText, priorIds);
      let sharpened;
      try {
        sharpened = await sharpenHunch(rawText, priors, answers, true);
      } catch (err) {
        // A diary keeps its promise even when the coach won't answer. Asked
        // about coming off a statin the model returns prose rather than an
        // object, and failing here would put the dead end back one step later
        // — after the user had already been told the app would keep the record.
        if (!(err instanceof NoStructuredOutput)) throw err;
        sharpened = diaryFallback(rawText);
      }
      return NextResponse.json(await persist(sharpened, priors), { status: 201 });
    } catch (err) {
      console.error("[hunch] sharpen failed:", err);
      return NextResponse.json({ error: SHARPEN_ERROR }, { status: 502 });
    }
  }

  // Everything that can still refuse — auth, empty input, medication — has run
  // above, with a real status code. From here the answer is a stream: the
  // hypothesis types out while the Coach writes it, and a failure past the
  // first byte arrives as the stream's last line instead of a 502.
  return sharpenStreamResponse(
    async (emit) => {
      const priors = await recallPriors(session.user.id, rawText, priorIds);
      const sharpened = await streamSharpenHunch(rawText, priors, answers, false, emit);
      return persist(sharpened, priors);
    },
    { label: "hunch" },
  );
```

Add the two type imports the helper needs:

```ts
import type { SharpenedHypothesis } from "@/lib/schemas/hypothesis";
import type { Prior } from "@/lib/schemas/prior";
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/app/api/hunch/route.test.ts`
Expected: PASS — every test in the file, old and new.

- [ ] **Step 5: Green the gate and report ready to commit**

Run: `npm test && npm run typecheck && npm run lint`
Suggested message:

```
feat(hunch): stream the sharpen instead of holding the response
```

---

### Task 5: The redo route streams too

**Files:**
- Modify: `src/app/api/hunch/[id]/sharpen/route.ts`
- Test: `src/app/api/hunch/[id]/sharpen/route.test.ts`

**Interfaces:**
- Consumes: the same `sharpenStreamResponse`, `SHARPEN_ERROR`, `streamSharpenHunch` as Task 4.
- Produces: `POST /api/hunch/[id]/sharpen` answering `200 application/x-ndjson` for a trial, unchanged `200 application/json` when `observeOnly: true`. The 401 / 404 / 409 / 400 / 422 guards are unchanged.

Both routes stream because they share one client — `useCreateHunch(resumeId)` posts to whichever applies and `new-hunch-form.tsx` renders both. Converting one would leave that hook carrying two transports.

- [ ] **Step 1: Write the failing test**

In `src/app/api/hunch/[id]/sharpen/route.test.ts`, widen the coach mock exactly as in Task 4:

```ts
vi.mock("@/mastra/agents/hypothesis-coach", () => ({
  sharpenHunch: vi.fn(),
  streamSharpenHunch: vi.fn(),
  NoStructuredOutput: class NoStructuredOutput extends Error {},
}));
```

Add the same imports and the same two helpers (`lines`, `coachStreams`) used in Task 4's test — repeated here rather than shared, because a reader of this file should not have to open another one:

```ts
import { streamSharpenHunch } from "@/mastra/agents/hypothesis-coach";
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
```

Update every existing test that reaches the model to use `coachStreams(sharpened)` in place of `vi.mocked(sharpenHunch).mockResolvedValue(sharpened)`, to expect `200` with a `done` line rather than a JSON body, and to `await lines(res)` before asserting on `db.$transaction`, `after` or `predesign`. Leave the 401 / 404 / 409 / 400 / 422 tests exactly as they are — they never reach the model.

Then append:

```ts
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
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run "src/app/api/hunch/[id]/sharpen/route.test.ts"`
Expected: FAIL — the route still answers with a single JSON body.

- [ ] **Step 3: Write the implementation**

In `src/app/api/hunch/[id]/sharpen/route.ts`, add the imports:

```ts
import { SHARPEN_ERROR, sharpenStreamResponse } from "@/lib/hunch-stream";
import { sharpenHunch, streamSharpenHunch } from "@/mastra/agents/hypothesis-coach";
import type { SharpenedHypothesis } from "@/lib/schemas/hypothesis";
import type { Prior } from "@/lib/schemas/prior";
```

Replace everything from `try {` to the end of the handler with:

```ts
  const { rawText, answers, priorIds, observeOnly } = parsed.data;

  /** Rewrite this hunch's hypothesis, its parameters and its design draft. */
  async function persist(sharpened: SharpenedHypothesis, priors: Prior[]) {
    const drafts = draftsFromSharpened(sharpened);
    const hypothesisData = {
      statement: sharpened.statement,
      outcomeMetric: sharpened.outcomeMetric,
      outcomeType: sharpened.outcomeType,
      // Re-sharpening rewrites the statement, so the prediction that goes with
      // it is rewritten too. Null when the Coach didn't give one, rather than
      // leaving the previous statement's direction attached to a new claim.
      expectedDirection: sharpened.expectedDirection ?? null,
      subject: sharpened.subject,
      confounders: sharpened.confounders,
      schedulable: sharpened.schedulable,
    };

    const updated = await db.$transaction(async (tx) => {
      // The proposed set belongs to the old hypothesis; a new one proposes its
      // own. Nothing is logged yet, so nothing hangs off these rows.
      await tx.parameter.deleteMany({ where: { hunchId: hunch!.id } });
      // A protocol designed for the old statement no longer describes this hunch.
      await tx.protocol.deleteMany({ where: { hunchId: hunch!.id } });

      return tx.hunch.update({
        where: { id: hunch!.id },
        data: {
          rawText,
          status: "sharpened",
          hypothesis: {
            upsert: { create: hypothesisData, update: hypothesisData },
          },
          parameters: {
            create: drafts.map((d, i) => ({
              label: d.label,
              type: d.type,
              unit: d.unit ?? null,
              min: d.min ?? null,
              max: d.max ?? null,
              isPrimary: d.isPrimary,
              isExposure: d.isExposure ?? false,
              sortOrder: i,
            })),
          },
        },
        include: { hypothesis: true, parameters: { orderBy: { sortOrder: "asc" } } },
      });
    });

    // The old draft was designed from the old hypothesis; this one replaces it.
    // See the note in `src/app/api/hunch/route.ts` on scheduling from inside a
    // streaming body.
    if (!observeOnly) {
      try {
        after(() => untimed(() => predesign(updated.id)));
      } catch (err) {
        console.warn("[re-sharpen] after() unavailable, pre-designing detached:", err);
        void untimed(() => predesign(updated.id)).catch(() => {});
      }
    }

    return { hunch: { ...updated, parameters: updated.parameters.map(toParameterDto) }, priors };
  }

  // A log stays on JSON, for the same reason it does on the create route.
  if (observeOnly) {
    try {
      const priors = await recallPriors(session.user.id, rawText, priorIds);
      const sharpened = await sharpenHunch(rawText, priors, answers, true);
      return NextResponse.json(await persist(sharpened, priors), { status: 200 });
    } catch (err) {
      console.error("[hunch] re-sharpen failed:", err);
      return NextResponse.json({ error: SHARPEN_ERROR }, { status: 502 });
    }
  }

  return sharpenStreamResponse(
    async (emit) => {
      const priors = await recallPriors(session.user.id, rawText, priorIds);
      const sharpened = await streamSharpenHunch(rawText, priors, answers, false, emit);
      return persist(sharpened, priors);
    },
    { label: "re-sharpen" },
  );
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run "src/app/api/hunch/[id]/sharpen/route.test.ts"`
Expected: PASS — every test in the file.

- [ ] **Step 5: Green the gate and report ready to commit**

Run: `npm test && npm run typecheck && npm run lint`
Suggested message:

```
feat(hunch): stream the redo sharpen as well
```

---

### Task 6: The client reads the lines back

**Files:**
- Modify: `src/hooks/use-create-hunch.ts`
- Test: `src/hooks/use-create-hunch.test.ts` (create)

**Interfaces:**
- Consumes: `readNdjson` (Task 1); the wire format from Tasks 4 and 5.
- Produces: `export type PartialHypothesis = Partial<SharpenedHypothesisDraft>`.
- Produces: `export async function postHunch(input: SharpenInput, resumeId?: string, onPartial?: (partial: PartialHypothesis) => void): Promise<HunchWithHypothesis>` — exported so it can be tested without React.
- Produces: `export function useCreateHunch(resumeId?: string, onPartial?: (partial: PartialHypothesis) => void)` — same `useMutation` and same `HunchWithHypothesis` data as today, so the form's success path is untouched.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/use-create-hunch.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { BlockedHunchError, postHunch } from "./use-create-hunch";

/** A response whose body arrives as exactly these chunks. */
function streamed(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(res: Response) {
  const fetchMock = vi.fn(async () => res);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const input = { rawText: "coffee wrecks sleep", answers: [] };
const done = { hunch: { id: "h1", hypothesis: { statement: "Coffee." } }, priors: [{ cause: "caffeine" }] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postHunch, streaming", () => {
  it("resolves with the done payload and feeds every partial on the way", async () => {
    mockFetch(
      streamed([
        '{"partial":{"statement":"Coffee after lun"}}\n',
        '{"partial":{"statement":"Coffee after lunch makes me sleep worse."}}\n',
        `${JSON.stringify({ done })}\n`,
      ]),
    );

    const seen: unknown[] = [];
    const result = await postHunch(input, undefined, (p) => seen.push(p));

    expect(seen).toEqual([
      { statement: "Coffee after lun" },
      { statement: "Coffee after lunch makes me sleep worse." },
    ]);
    expect(result).toMatchObject({ id: "h1", priors: [{ cause: "caffeine" }] });
  });

  it("reassembles a line the network split in two", async () => {
    mockFetch(
      streamed([`${JSON.stringify({ done }).slice(0, 20)}`, `${JSON.stringify({ done }).slice(20)}\n`]),
    );

    await expect(postHunch(input)).resolves.toMatchObject({ id: "h1" });
  });

  it("rejects with the message an error line carries", async () => {
    mockFetch(
      streamed([
        '{"partial":{"statement":"Coffee after lun"}}\n',
        '{"error":"Couldn\'t sharpen your hunch right now. Please try again in a moment."}\n',
      ]),
    );

    const seen: unknown[] = [];
    await expect(postHunch(input, undefined, (p) => seen.push(p))).rejects.toThrow(
      "Couldn't sharpen your hunch right now",
    );
    // The half-written text was still delivered; the form keeps it on screen.
    expect(seen).toHaveLength(1);
  });

  it("rejects when the stream ends with no terminal line", async () => {
    mockFetch(streamed(['{"partial":{"statement":"Coffee after lun"}}\n']));

    await expect(postHunch(input)).rejects.toThrow("Something went wrong sharpening your hunch.");
  });

  it("rejects when a line is not JSON at all", async () => {
    mockFetch(streamed(["<!doctype html>\n"]));

    await expect(postHunch(input)).rejects.toThrow("Something went wrong sharpening your hunch.");
  });

  it("posts a redo to the resume route", async () => {
    const fetchMock = mockFetch(streamed([`${JSON.stringify({ done })}\n`]));

    await postHunch(input, "h1");

    expect(fetchMock.mock.calls[0][0]).toBe("/api/hunch/h1/sharpen");
  });
});

describe("postHunch, JSON", () => {
  it("raises a BlockedHunchError on the medication refusal", async () => {
    mockFetch(jsonResponse({ blocked: "medication", error: "We can't plan that." }, 422));

    await expect(postHunch(input)).rejects.toBeInstanceOf(BlockedHunchError);
  });

  it("takes the 201 body of an observe-only sharpen", async () => {
    mockFetch(jsonResponse(done, 201));

    await expect(postHunch({ ...input, observeOnly: true })).resolves.toMatchObject({ id: "h1" });
  });

  it("raises the message of a plain error body", async () => {
    mockFetch(jsonResponse({ error: "Unauthorized" }, 401));

    await expect(postHunch(input)).rejects.toThrow("Unauthorized");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run src/hooks/use-create-hunch.test.ts`
Expected: FAIL — `postHunch` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/hooks/use-create-hunch.ts`, add the imports:

```ts
import { readNdjson } from "@/lib/ndjson";
import type { SharpenedHypothesisDraft } from "@/lib/schemas/hypothesis";
```

Add above `postHunch`:

```ts
/** What the Coach has written so far, in the schema's own field order. */
export type PartialHypothesis = Partial<SharpenedHypothesisDraft>;

type SharpenInput = {
  rawText: string;
  answers: ClarifyingAnswer[];
  observeOnly?: boolean;
  priorIds?: string[];
};

/** One line of a streamed sharpen. Exactly one terminal line ends the body. */
type SharpenLine = {
  partial?: PartialHypothesis;
  done?: { hunch?: unknown; priors?: Prior[] };
  error?: string;
};

const GENERIC_FAILURE = "Something went wrong sharpening your hunch.";
```

Replace `postHunch` with:

```ts
/**
 * Post a hunch and read the sharpened hypothesis back.
 *
 * A trial streams: the route answers with one JSON object per line, the
 * partials go to `onPartial` so the form can type the statement out, and the
 * last line is the `done` payload this resolves with — the same body the route
 * used to return in one piece.
 *
 * Everything that can refuse still answers with a real status and a JSON body:
 * the 401, the empty-input 400, the medication 422. `observeOnly` answers with
 * JSON too. Exported (rather than left private to the hook) so the line
 * handling can be tested without React.
 */
export async function postHunch(
  input: SharpenInput,
  resumeId?: string,
  onPartial?: (partial: PartialHypothesis) => void,
): Promise<HunchWithHypothesis> {
  const res = await fetch(resumeId ? `/api/hunch/${resumeId}/sharpen` : "/api/hunch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const streaming = (res.headers.get("Content-Type") ?? "").includes("ndjson");
  if (!streaming || !res.body) {
    // Tolerate a non-JSON / empty body (e.g. an unhandled 5xx) instead of
    // letting res.json() throw a raw "Unexpected end of JSON input" at the UI.
    const body = await res.json().catch(() => null);
    if (res.status === 422 && body?.blocked) {
      throw new BlockedHunchError(body.blocked as string, body.error as string);
    }
    if (!res.ok || !body?.hunch) {
      throw new Error(body?.error ?? GENERIC_FAILURE);
    }
    return { ...body.hunch, priors: body.priors ?? [] } as HunchWithHypothesis;
  }

  let result: HunchWithHypothesis | null = null;
  let failure: string | null = null;
  try {
    for await (const line of readNdjson(res.body)) {
      const msg = line as SharpenLine;
      if (msg.error) failure = msg.error;
      else if (msg.done?.hunch) {
        result = { ...(msg.done.hunch as object), priors: msg.done.priors ?? [] } as HunchWithHypothesis;
      } else if (msg.partial) onPartial?.(msg.partial);
    }
  } catch {
    // A torn stream: a line that wasn't JSON, or a connection that dropped.
    // Same dead end as an error line, and whatever was already typed out stays
    // on screen either way.
  }

  if (failure) throw new Error(failure);
  if (!result) throw new Error(GENERIC_FAILURE);
  return result;
}
```

And widen the hook:

```ts
export function useCreateHunch(
  resumeId?: string,
  onPartial?: (partial: PartialHypothesis) => void,
) {
  return useMutation({
    mutationFn: (input: SharpenInput) => postHunch(input, resumeId, onPartial),
  });
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `npx vitest run src/hooks/use-create-hunch.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Green the gate and report ready to commit**

Run: `npm test && npm run typecheck && npm run lint`
Suggested message:

```
feat(hunch): read the sharpened hypothesis as it streams in
```

---

### Task 7: What the user watches

**Files:**
- Modify: `src/components/hunch/new-hunch-form.tsx`

**Interfaces:**
- Consumes: `useCreateHunch(resumeId, onPartial)` and `PartialHypothesis` (Task 6).
- Produces: nothing other tasks use.

There is no jsdom or React Testing Library in this project's Vitest setup, so this task is verified by typecheck, lint and a live run rather than a unit test. Everything about it that could be unit-tested — the line reading — already was, in Task 6.

- [ ] **Step 1: Hold the partial hypothesis in form state**

In `src/components/hunch/new-hunch-form.tsx`, add `PartialHypothesis` to the `use-create-hunch` import, and just above `const createHunch = useCreateHunch(resuming?.id);`:

```tsx
  // What the Coach has written so far. Kept on an error rather than cleared:
  // wiping text the user just watched appear reads as a crash, which is the
  // opposite of what streaming is for.
  const [partial, setPartial] = useState<PartialHypothesis | null>(null);
  const createHunch = useCreateHunch(resuming?.id, setPartial);
```

- [ ] **Step 2: Clear it at the start of each attempt**

In `commit()`, immediately before `createHunch.mutate({ rawText: rawText.trim(), answers: payload, priorIds });`:

```tsx
    setPartial(null);
```

In `startClarify`'s `onError` fallback, immediately before `createHunch.mutate({ rawText: text, answers: [] });`:

```tsx
        setPartial(null);
```

In the "Edit my hunch" button's `onClick`, immediately before `createHunch.reset();`:

```tsx
                setPartial(null);
```

- [ ] **Step 3: Render it**

Immediately after the `{nudge && (…)}` block and before the `{blocked ? (…)}` block, add:

```tsx
      {/* The hypothesis as it is being written. The button still says
          "Sharpening…" — it is still accurate, and it is where the eye already
          is — but the wait is no longer blank: at 11.5s a blank button is
          indistinguishable from a hung page.

          aria-live="off" on purpose: a screen reader announcing every partial
          would be unusable. The finished statement is announced once, below.

          No prefers-reduced-motion branch: this is text arriving, not an
          animation, and there is no cursor effect to suppress. */}
      {partial && (
        <section
          aria-live="off"
          className="mt-5 grid gap-2 rounded-xl border border-rule bg-card p-[clamp(20px,2.4vw,28px)]"
        >
          <p className="m-0 font-heading text-[clamp(18px,2.2vw,22px)] font-bold leading-snug tracking-[-0.01em] text-ink [overflow-wrap:anywhere]">
            {partial.statement ?? "…"}
          </p>
          {/* Placeholders hold their lines from the first frame, so the shape
              of what is coming is legible instead of jumping into existence. */}
          <p className="m-0 font-mono text-sm text-muted-foreground [overflow-wrap:anywhere]">
            Measuring:{" "}
            {partial.outcomeMetric ?? <span className="opacity-50">…</span>}
          </p>
          <p className="m-0 font-mono text-sm text-muted-foreground [overflow-wrap:anywhere]">
            Tracking:{" "}
            {partial.trackers?.length ? (
              partial.trackers.map((t) => t?.label).filter(Boolean).join(", ")
            ) : (
              <span className="opacity-50">…</span>
            )}
          </p>
        </section>
      )}

      {/* Announced once, when the stream has finished. */}
      <p className="sr-only" aria-live="polite">
        {createHunch.data ? `Sharpened: ${createHunch.data.hypothesis.statement}` : ""}
      </p>
```

Note: write the ellipses as real `…` characters in the file; they are escaped here only to survive this document.

- [ ] **Step 4: Verify it live**

```bash
DEV_AUTH_BYPASS=1 npm run dev
```

Open `http://localhost:3000/hunch/new`, type "coffee after lunch wrecks my sleep", answer the questions and press "Lock it in". Confirm, in order:

1. The statement types out under the button while it reads "Sharpening…".
2. `Measuring:` and `Tracking:` show their placeholder from the first frame and fill in later.
3. The app lands on `/hunch/{id}/protocol` with the same statement.
4. Press "redo" on the confirm gate and reword — the same streaming happens on the redo route.

Then check the error road, with the dev server running:

```bash
# In a second terminal: break the model for one request.
OPENROUTER_API_KEY=nonsense DEV_AUTH_BYPASS=1 npm run dev
```

Sharpen again and confirm the half-written text **stays** on screen with the red error line beneath it, rather than the panel disappearing.

- [ ] **Step 5: Green the gate and report ready to commit**

Run: `npm test && npm run typecheck && npm run lint`
Suggested message:

```
feat(hunch): show the hypothesis being written instead of a blank button
```

---

### Task 8: The bench reads a stream

**Files:**
- Modify: `scripts/bench-hunch-flow.ts`

**Interfaces:**
- Consumes: the wire format from Tasks 4 and 5.
- Produces: nothing other tasks use.

W2 now answers with NDJSON and a 200, so `JSON.parse` of the whole body fails and the `w2.status === 201` check never matches — without this task the bench's W1→W2→W3 chain silently stops after W1. Two readings also change meaning, and the script should say so rather than leave a later reader to mistake it for a regression: `coach` is gone from W2's `Server-Timing` (the header is written before the model runs), and W2's `total` now measures only the time to build the response. W2's **client** total is unchanged and is still the honest number for the wait.

- [ ] **Step 1: Teach `call` to read a streamed body**

In `scripts/bench-hunch-flow.ts`, replace the `Timed` type and the `call` function with:

```ts
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

  let status = res.status;
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    const terminal = terminalNdjson(text);
    if (terminal?.done !== undefined) parsed = terminal.done;
    else if (terminal?.error !== undefined) {
      // A streamed failure is the 502 this replaced; the rest of the script
      // counts it exactly as it always did.
      parsed = { error: terminal.error };
      status = 502;
    }
    // Otherwise left as text: an HTML error page from Next, say.
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
```

- [ ] **Step 2: Take W2's hunch from the body rather than from a 201**

In `chain`, replace:

```ts
  const hunch = w2.status === 201 ? w2.body.hunch : null;
```

with:

```ts
  // 200 + NDJSON now, 201 + JSON for a log; either way the hunch is in the body.
  const hunch = w2.status < 400 && w2.body?.hunch ? w2.body.hunch : null;
```

and extend its `record(...)` note with the time to the first streamed line:

```ts
  record(
    run, "W2", scenario, w2, fires,
    hunch
      ? `schedulable=${hunch.hypothesis.schedulable} priors=${w2.body.priors.length}` +
        (w2.firstByteMs !== undefined ? ` first line ${fmtMs(w2.firstByteMs)}` : "")
      : undefined,
  );
```

- [ ] **Step 3: Say what moved, in the file's own header**

In the docblock at the top of `scripts/bench-hunch-flow.ts`, after the `--read-pause` paragraph, add:

```
 * W2 streams (spec 2026-09-20). Its client total is unchanged — the wait still
 * ends when the whole body has arrived — but two server-side readings moved:
 * `coach` is no longer in its Server-Timing, because the header is written
 * when the handler returns and the model runs after that, and W2's `total` now
 * measures only the time to build the streaming response. The number to read
 * for W2 is the client total, plus "first line", which is when the user stops
 * seeing a blank button. With HUNCH_TIMING=1 the server logs the coach's own
 * duration and token counts to its console.
```

- [ ] **Step 4: Run it**

With the dev server up (`DEV_AUTH_BYPASS=1 HUNCH_TIMING=1 npm run dev`):

```bash
npx tsx scripts/bench-hunch-flow.ts --runs 1 --read-pause 8
```

Expected: the W1→W2→W3 chain completes for every scenario (a broken chain shows as a W1 row with no W2 or W3 under it); W2's row carries a `first line …` note that is well under its client total; W3 still reports `hit`.

- [ ] **Step 5: Green the gate and report ready to commit**

Run: `npm test && npm run typecheck && npm run lint`
Suggested message:

```
chore(bench): read the streamed sharpen and report time to first line
```

---

### Task 9: One eval, and the live check

**Files:**
- Modify: `src/mastra/agents/hypothesis-coach.eval.test.ts`

**Interfaces:**
- Consumes: `streamSharpenHunch` (Task 2).
- Produces: nothing other tasks use.

The existing evals exercise the Coach's judgement through `sharpenHunch`. `streamSharpenHunch` shares the prompt, the schema and the token cap, so they do not need duplicating — one eval asserting the streamed path returns a hypothesis of the same quality is what would catch the two drifting apart.

- [ ] **Step 1: Write the eval**

Append to `src/mastra/agents/hypothesis-coach.eval.test.ts`, adding `streamSharpenHunch` to its import:

```ts
describe.skipIf(!hasKey)("Hypothesis Coach, streamed", () => {
  test("streams a hypothesis of the same shape the generated path returns", async () => {
    const partials: Array<Record<string, unknown>> = [];
    const h = await streamSharpenHunch(
      "i think coffee in the afternoon wrecks my sleep",
      [],
      [],
      false,
      (p) => partials.push(p as Record<string, unknown>),
    );

    // Same contract as the generated path — this is the guard against the two
    // drifting apart, since they share the prompt and the schema.
    expect(sharpenedHypothesisSchema.safeParse(h).success).toBe(true);
    expect(h.statement.trim().endsWith("?")).toBe(false);
    expect(h.outcomeMetric.split(/\s+/).length).toBeGreaterThanOrEqual(2);

    // It actually streamed, and the statement led — that ordering is what the
    // form's display depends on.
    expect(partials.length).toBeGreaterThan(1);
    expect(Object.keys(partials[0])).toContain("statement");

    // The last partial is the finished object, so the text the user watched
    // appear is the text they end up with.
    expect(partials.at(-1)!.statement).toBe(h.statement);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:eval -- src/mastra/agents/hypothesis-coach.eval.test.ts`
Expected: PASS (it self-skips without `OPENROUTER_API_KEY`). This one spends real model credits.

- [ ] **Step 3: Verify the whole flow live, end to end**

```bash
DEV_AUTH_BYPASS=1 HUNCH_TIMING=1 npm run dev
```

1. Sharpen a hunch at `/hunch/new` and watch the statement type out.
2. Confirm the dev server's console shows the `[timing] coach (streamed) dur=… in=… out=…` line.
3. Confirm the app reaches `/hunch/{id}/protocol` and that pressing confirm is still instant — meaning `after(() => untimed(() => predesign(…)))` really did run from inside the streaming body. If it did not, the console carries the `after() unavailable, pre-designing detached` warning and confirm designs inline; check `DesignDraft` rows if unsure.
4. Sharpen a hunch about coming off a medication, choose "Track it as it is", and confirm the log is still created through the JSON path with its diary fallback intact.

- [ ] **Step 4: Green the gate and report ready to commit**

Run: `npm test && npm run typecheck && npm run lint`
Suggested message:

```
test(coach): hold the streamed path to the generated path's contract
```

---

## Verification

After Task 9, the whole change is verified by:

```bash
npm test && npm run typecheck && npm run lint
npm run test:eval -- src/mastra/agents/hypothesis-coach.eval.test.ts
npx tsx scripts/bench-hunch-flow.ts --runs 1 --read-pause 8
```

What the bench should show: W2's client total in the same 4–12s band as before (streaming does not make the Coach faster — the same tokens take the same time), with a `first line` reading a second or two in, and W3 still `hit`.

## Out of scope

Carried straight from the spec, so a later reader does not mistake any of these for an omission:

- Hiding the seam between the form and the confirm gate (creating the hunch row before the Coach runs is the better end state, and is not this change).
- Streaming the `observeOnly` path.
- Shortening the Coach's output — the real fix for the median, deliberately not bundled so the two changes can be evaluated separately.
- Streaming any other agent.
