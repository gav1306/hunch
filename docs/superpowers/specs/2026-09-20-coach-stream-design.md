# Streaming the Coach — design

**Date:** 2026-09-20
**Status:** spec, not yet planned or built
**Follows:** the hunch-flow latency work on `perf/hunch-flow-timing` (PR #35 — fixes #1 recall dedupe, #2 Haiku recall, #3 pre-designed plans, #4 slim designer). This is ranked item #6 from the 2026-09-11 latency audit.

---

## The wait

With W3 (confirm → plan) down from ~13.5s to 47ms, the Coach is the worst wait left in the flow. The 2026-09-19 bench measured W2 (clarifying answers → confirm gate) at **4.1–11.6s**.

The median is not the problem. The spread is:

| scenario | output tokens | W2 |
| --- | --- | --- |
| phased/new (run A) | 248 | 4.13s |
| phased/new (run B) | 687 | 8.59s |
| observational/returning | 832 | 11.55s |

Identical fixed input, twice the wait. The relationship is close to linear — roughly a 2.2s floor plus ~8.5ms per output token — so the Coach's latency is very nearly a readout of how much it decided to write. The app cannot predict which run it is getting.

Through all of it the user sees one button reading "Sharpening…". At 4s that is a pause. At 11.5s it is indistinguishable from a hung page, and the honest reading of an 11.5s blank button is that the app has stopped working.

## What this fixes, and what it does not

Streaming does not make the Coach faster. The same tokens take the same time.

It makes the wait legible: the user watches the hypothesis being written instead of watching a button. An 11.5s wait with visible progress is tolerable in a way that a 4s blank one is not, which is why this is worth doing ahead of the shorter absolute waits elsewhere.

**Shortening** the Coach is a separate lever — the output-length one, since latency tracks token count so closely. Prompt changes that cut `trackers` padding or tighten `confounders` would move the median. Deliberately not bundled here: the two changes want separate evals, and mixing them makes it impossible to attribute a regression.

## Scope

The Coach runs from two routes, plus one flag:

| entry point | after this change |
| --- | --- |
| `POST /api/hunch` | streams |
| `POST /api/hunch` with `observeOnly: true` | unchanged JSON |
| `POST /api/hunch/[id]/sharpen` (redo) | streams |

Both routes stream because they share one client: `useCreateHunch(resumeId)` posts to whichever applies, and `new-hunch-form.tsx` renders both. Converting one route only would leave that single hook carrying two transports and branching on `resumeId`, and the form rendering both a streaming state and a spinner state — more code than converting both, not less.

`observeOnly` opts out. The client sets it before the request, so the choice costs one boolean. It is carved out because it is the one path where the Coach's visible output is discarded: asked about medication the model returns prose rather than an object, `sharpenHunch` throws `NoStructuredOutput`, and `diaryFallback` substitutes a hypothesis built without the model from the user's own words. Streaming a call whose output may be thrown away and replaced is the messiest case and the rarest, and its fallback logic is already tested on the JSON path.

## The shape of it

### 1. Transport

Newline-delimited JSON over a plain `ReadableStream`.

Server-Sent Events are out: `EventSource` is GET-only and this is a POST with a body. The AI SDK's UI-message stream helpers are out: they would add `ai` as a direct dependency (only `@ai-sdk/openai-compatible` is direct today), and RULES §1 asks every new dependency to justify itself. These helpers are built for chat transcripts; this streams one bespoke object. `fetch` already hands the client a reader.

One JSON object per line:

```
{"partial":{"statement":"Coffee after lunch makes me sle"}}
{"partial":{"statement":"Coffee after lunch makes me sleep worse.","outcomeMetric":"hours of"}}
{"done":{"hunch":{…},"priors":[…]}}
```

and, when something fails after the first byte:

```
{"error":"Couldn't sharpen your hunch right now. Please try again in a moment."}
```

Exactly one terminal line, `done` or `error`, always.

### 2. The Coach gains a streaming sibling

`sharpenHunch` stays exactly as it is — `observeOnly` still calls it, and it keeps its `timed("coach", …)` wrapper and its `llmUsage` accounting.

Alongside it, `streamSharpenHunch` calls `hypothesisCoach.stream(...)` with the same prompt, the same `sharpenedHypothesisObjectSchema`, and the same `maxOutputTokens: 1024`, then exposes Mastra's `objectStream` (`ReadableStream<Partial<OUTPUT>>`, confirmed present in `@mastra/core` 1.36.0). It yields partials and finally returns the same validated `SharpenedHypothesis` that `sharpenHunch` returns, through the same `sharpenedHypothesisSchema.parse(normaliseSchedulability(...))`.

The schema's field order is `statement` → `outcomeMetric` → `outcomeType` → `confounders` → `expectedDirection` → `subject` → `trackers` → `schedulable` → `exposure`, so partials arrive with the statement first and the trackers late. That ordering is what makes the display work, and it is a property of the schema, not of the model — a reordering of the schema would silently change what the user watches appear. Worth a comment at the schema.

The two functions share `buildSharpenPrompt`, which is already extracted and unit-tested.

### 3. The routes

Both routes keep their current structure. Everything up to the model call is unchanged, which matters: auth, the empty-input check and the medication refusal all run **before** the first byte, so they stay real HTTP statuses (401 / 400 / 422) and `BlockedHunchError` and its refusal panel are untouched.

From the model call onward the route writes lines instead of building a response. Validation, `normaliseSchedulability`, the parameter drafts, the `db.hunch.create` and the `after(() => untimed(() => predesign(hunch.id)))` hook all stay exactly where they are and run once the object is complete. The `done` line then carries the same payload the route returns today — `{ hunch, priors }` — so nothing downstream of the response changes.

`timed`/`withTiming` need care. The `Server-Timing` header must be written before the body starts, so the `coach` step cannot be reported in it any more. The existing `untimed` helper (added for the predesign `after()` work) is the precedent for work that outlives the header. The bench reads `Server-Timing` to attribute model time, so `scripts/bench-hunch-flow.ts` will report W2 differently after this change; the spec's expectation is that W2's client total stays the same and its model attribution moves, and the plan should say so explicitly rather than let a later reader mistake it for a regression.

### 4. Failure after the first byte

Once a byte is written the status code is spent — a 502 is no longer available. This is the bug class `2e6c5ad` ("answer a failed design with a message, not a bare 500") already fixed once at the protocol route, and the same discipline applies here.

Every failure after streaming begins becomes a final `{"error": …}` line carrying the same message the 502 carries today. The client turns that line into the same `Error` the form already renders. Nothing new appears in the UI; the message arrives by a different road.

Covered: the Coach throwing or returning no object, the final Zod parse failing, and the `db.hunch.create` rejecting. A dropped connection mid-stream needs no server handling — the client's reader ends without a terminal line, which the client treats as the same error.

### 5. The client

`use-create-hunch.ts` keeps its `useMutation` and its `HunchWithHypothesis` return type, so `new-hunch-form.tsx`'s success path — cache seeding, `keptAsLog`, `router.push('/hunch/{id}/protocol')` — is unchanged.

What is added: the hook reads the response body as a stream, parses each line, feeds `partial` objects to a callback, resolves the mutation on `done`, and rejects on `error` or on a stream that ends without either. A reader must tolerate a chunk boundary falling mid-line: buffer, split on `\n`, keep the remainder.

`observeOnly: true` posts and parses as JSON exactly as today.

### 6. What the user sees

The statement types out as it arrives. `Measuring:` and `Tracking:` hold visible placeholders until their fields land, so the shape of what is coming is legible from the first frame rather than jumping into existence. The button keeps saying "Sharpening…"; it is still accurate, and it is what the user's eye is already resting on.

On an error the half-written text **stays** and the message appears beneath it. Wiping text the user just watched appear reads as a crash, which is the opposite of what streaming is for.

Reduced motion: the typing is text arriving, not an animation, and there is no cursor effect to suppress. No `prefers-reduced-motion` branch is needed. A screen reader should not have every partial announced — the streaming region is `aria-live="off"` while in flight, and the completed statement is announced once when the stream ends.

### 7. The seam

The statement types out on the form, and when the stream completes the app navigates to `/hunch/{id}/protocol`, which renders that same statement again. One visible transition at the end, accepted deliberately.

The alternative — creating the hunch row before the Coach runs so the confirm gate has an address to stream into — removes the seam entirely and survives a page refresh. It is the better end state. It is not this change: it inverts when a hunch is persisted, needs a "still being written" state that every reader of a hunch must tolerate, and lands directly on the `after()` predesign hook that shipped this week and is still in an open PR. Making the seam invisible by aligning the two pages' first paint is a third option, and is polish that reads better once the streaming itself exists.

## Testing

The routes' existing tests assert JSON bodies and must gain streaming equivalents. A fake `objectStream` yielding known partials keeps every one of these off the model:

- partial lines arrive in order, and the terminal line is exactly one `done`
- the `done` payload matches today's 201 body field for field — the strongest guard that nothing downstream changed
- the Coach failing mid-stream produces a final `error` line, not a thrown 500 and not a half-open stream
- the final Zod parse failing produces an `error` line
- `db.hunch.create` rejecting produces an `error` line
- the medication refusal still returns a real 422 with no body streamed
- `observeOnly: true` still returns JSON, and `diaryFallback` still runs — these tests should be unchanged, which is the point of the carve-out
- the redo route behaves identically to the create route on all of the above
- the client's line reader reassembles a line split across two chunks

`hypothesis-coach.eval.test.ts` exercises the Coach's judgement through `sharpenHunch`. `streamSharpenHunch` shares the prompt and the schema, so the evals do not need duplicating; one eval asserting the streamed path returns a hypothesis equal to the generated path's would catch a divergence between the two.

## Alternatives weighed

**Staged progress with no model output** — "reading your answers… writing the hypothesis… picking what to track". Simpler, no half-formed sentences. Rejected: it is theatre. The stages would be inferred from which fields have arrived, so it carries strictly less information than showing the fields, while implying knowledge of progress the app does not have.

**Statement only, then swap the rest in** — stream the one line the user cares about, hold everything else until done. Rejected as a smaller version of the same work: once a partial object is being read, rendering `outcomeMetric` from it costs nothing, and holding a field that has already arrived is a deliberate withholding that would need its own justification.

**Shortening the Coach instead** — the real fix for the median, and genuinely complementary. Not bundled, per "What this fixes" above.

## Out of scope

- Hiding the seam between the form and the confirm gate
- Streaming the `observeOnly` path
- Shortening the Coach's output
- Streaming any other agent (the Analyst's ~3.8s first-verdict wait is ranked item #5 and has a better fix available — precomputing it when the trial ends)
