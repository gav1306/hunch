import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Where a request's time goes, reported as a standard `Server-Timing` header.
 * Server-only (it leans on node:async_hooks) and off unless `HUNCH_TIMING=1`.
 *
 * Every step of making a hunch runs model calls inside the HTTP request, and
 * the question this answers is whether a slow wait is the model or our own
 * code. `withTiming` wraps a route handler and owns the request's record;
 * `timed` wraps one awaited step anywhere below it — an agent's `generate`, a
 * DB load — and writes into whichever record is active. With timing off there
 * is no record at all: the handler's response comes back as the very same
 * object, and `timed` only awaits what it was given.
 *
 * The record lives in AsyncLocalStorage rather than being passed down, so an
 * agent function can time itself without every caller threading a collector
 * through, and two overlapping requests never see each other's steps.
 *
 *   recall;dur=812.4;desc="in=640 out=38", clarifier;dur=9412.0, total;dur=10390.2
 */

/** Token counts read off a model response, when the provider reports them. */
export type TokenUsage = { inputTokens?: number; outputTokens?: number };

type Step = { name: string; dur: number; usage?: TokenUsage };
type RequestRecord = { steps: Step[]; seen: Map<string, number> };

const requests = new AsyncLocalStorage<RequestRecord>();

/** Read per call, not at import, so a test or a restarted server can flip it. */
function enabled(): boolean {
  return process.env.HUNCH_TIMING === "1";
}

function record(rec: RequestRecord, name: string, dur: number, usage?: TokenUsage) {
  // A step that runs twice in one request (a retry, a loop) keeps both
  // readings: the second is "designer-2", not a silent overwrite of the first.
  const count = (rec.seen.get(name) ?? 0) + 1;
  rec.seen.set(name, count);
  rec.steps.push({ name: count === 1 ? name : `${name}-${count}`, dur, usage });
}

function formatStep({ name, dur, usage }: Step): string {
  const tokens = [
    usage?.inputTokens !== undefined ? `in=${usage.inputTokens}` : null,
    usage?.outputTokens !== undefined ? `out=${usage.outputTokens}` : null,
  ].filter(Boolean);
  const desc = tokens.length ? `;desc="${tokens.join(" ")}"` : "";
  return `${name};dur=${dur.toFixed(1)}${desc}`;
}

/**
 * Wrap a route handler. With timing on, the handler runs inside a fresh
 * record, its whole run is recorded as `total`, and the steps go out on the
 * response's `Server-Timing` header. With timing off this is the handler.
 */
export function withTiming<A extends unknown[], R extends Response>(
  handler: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    if (!enabled()) return handler(...args);

    const rec: RequestRecord = { steps: [], seen: new Map() };
    const start = performance.now();
    const response = await requests.run(rec, () => handler(...args));
    record(rec, "total", performance.now() - start);
    response.headers.append("Server-Timing", rec.steps.map(formatStep).join(", "));
    return response;
  };
}

/**
 * Await one step and, if a request is being timed, record how long it took.
 * `usageOf` pulls token counts off the result for the header's `desc`; it is
 * only consulted when something is recording. A step that throws is still
 * recorded — a model call that timed out after 30s is exactly the reading
 * that matters — and its error is rethrown as is.
 */
export async function timed<T>(
  name: string,
  fn: () => Promise<T>,
  usageOf?: (result: T) => TokenUsage | undefined,
): Promise<T> {
  const rec = requests.getStore();
  if (!rec) return fn();

  const start = performance.now();
  let result: T;
  try {
    result = await fn();
  } catch (err) {
    record(rec, name, performance.now() - start);
    throw err;
  }
  record(rec, name, performance.now() - start, usageOf?.(result));
  return result;
}

/**
 * Run work that outlives the request — an `after()` callback — with no timing
 * record active. Such a callback inherits the request's async context, so
 * without this its `timed` steps would be pushed into a record whose
 * `Server-Timing` header has already gone out.
 */
export function untimed<T>(fn: () => T): T {
  return requests.exit(fn);
}

type UsageLike = { inputTokens?: number | undefined; outputTokens?: number | undefined };

/**
 * Token usage off a Mastra `agent.generate` result. `totalUsage` sums every
 * step of the run and `usage` is only the last one; they agree for a
 * single-step structured call, and the total is the honest number if not.
 */
export function llmUsage(
  response: { usage?: UsageLike; totalUsage?: UsageLike } | undefined,
): TokenUsage | undefined {
  const u = response?.totalUsage ?? response?.usage;
  if (!u) return undefined;
  return { inputTokens: u.inputTokens, outputTokens: u.outputTokens };
}

/** One entry of a parsed `Server-Timing` header. */
export type TimingEntry = { name: string; dur: number; inputTokens?: number; outputTokens?: number };

/**
 * Read a `Server-Timing` header written by `withTiming` back into entries —
 * the benchmark's side of the format above. Unknown params are ignored.
 */
export function parseServerTiming(header: string | null): TimingEntry[] {
  if (!header) return [];
  return header.split(",").map((part) => {
    const [name, ...params] = part.trim().split(";");
    const entry: TimingEntry = { name, dur: 0 };
    for (const param of params) {
      // Split on the first "=" only: the desc's own value is full of them.
      const eq = param.indexOf("=");
      const key = (eq === -1 ? param : param.slice(0, eq)).trim();
      const raw = eq === -1 ? "" : param.slice(eq + 1).trim();
      if (key === "dur") entry.dur = Number(raw);
      if (key === "desc") {
        for (const token of raw.replace(/^"|"$/g, "").split(" ")) {
          const [k, v] = token.split("=");
          if (k === "in") entry.inputTokens = Number(v);
          if (k === "out") entry.outputTokens = Number(v);
        }
      }
    }
    return entry;
  });
}
