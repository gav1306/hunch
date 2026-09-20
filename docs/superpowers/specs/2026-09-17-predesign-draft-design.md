# Pre-designed plans — design

**Date:** 2026-09-17
**Status:** spec, not yet planned or built
**Follows:** the hunch-flow latency work on `perf/hunch-flow-timing` (bench in `scripts/bench-hunch-flow.ts`; fixes #1 recall dedupe, #2 Haiku recall, #4 slim designer)

---

## The wait

Making a hunch has three waits before the user holds a plan. The last one, W3 — pressing confirm on the plan page until the plan appears — is the longest: the design workflow runs inside the request, a Protocol Designer call and then a Safety Reviewer call, one after the other. The 2026-09-14 bench measured it at 11.6–13.5s median.

Fix #4 (the designer writes only phase copy; observational designs skip the designer) should bring it to roughly 5–6s for a scheduled trial and ~3.5s for an observational one. Still the longest wait in the flow, and all of it is spent on work that could have started earlier.

## Why it can start earlier

Everything the design depends on is known the moment the hunch is sharpened:

| Input                                                         | Known at sharpen?                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| statement, outcome metric, outcome type, confounder names     | Yes — the Hypothesis row                                    |
| shape (phased / observational)                                | Yes — `Hypothesis.schedulable`; the gate can overrule it    |
| exposure label (observational only)                           | Usually — the Coach's proposed exposure tracker; the gate can rename it |
| the tracker list the user edits on the gate                   | **Not used by the design at all**                           |

So a design computed right after sharpening is still the right design when the user presses confirm, unless they flipped the shape or renamed the daily yes/no. Editing trackers — the common edit on the gate — does not invalidate it.

The user spends several seconds reading the confirm gate anyway. Designing during that read turns W3 into a database write.

## The shape of it

Chosen over two alternatives (see "Alternatives weighed"): **Next's `after()`** schedules the design at the end of the sharpen request; the result is stored as a draft; confirm uses the draft when its inputs still match and otherwise designs inline exactly as it does today.

The inline path is kept whole, which is the property the rest of the design leans on: **a missing, stale, failed or slow draft costs only the speed-up, never the plan.**

### 1. The draft

```prisma
model DesignDraft {
  hunchId     String   @id
  fingerprint String
  status      String   // designing | ready | failed
  result      Json?    // DesignResult: { confounders, design, powerInfo, safety }
  updatedAt   DateTime @updatedAt

  hunch Hunch @relation(fields: [hunchId], references: [id], onDelete: Cascade)
}
```

One row per hunch. A separate table, not a `Protocol` row with a special state: the plan page renders a plan whenever a Protocol row exists, and a draft must stay invisible until the user confirms.

`result` stores the safety verdict raw. `resolveSafetyState` (and with it the `AUTO_APPROVE_ENABLED` switch) is applied at confirm time, so flipping the switch governs drafts already stored.

### 2. The fingerprint

`designFingerprint(input)` → sha256 hex of a canonical JSON of:

- `version` — `DESIGN_VERSION`, a constant in `src/lib/design-draft/fingerprint.ts` (not beside `designProtocol`, so the fingerprint module never loads the agents). Bumped whenever a prompt, a model, or the code that assembles a design changes, so drafts made by older logic are never served.
- `statement`, `outcomeMetric`, `outcomeType`, `confounderNames` (in stored order)
- `shape`
- `exposureLabel`, trimmed — **only** when `shape` is `observational`; omitted otherwise, since a phased design never reads it

Two callers compute it from different sources and must agree: `predesign` from the stored rows, the protocol route from the stored hypothesis plus the request's shape override and confirmed exposure row. Both go through the one function.

### 3. Starting the design

Both sharpen routes — `POST /api/hunch` and `POST /api/hunch/[id]/sharpen` — after their DB write succeeds:

```ts
after(() => untimed(() => predesign(hunch.id)));
```

Not scheduled for an observe-only (diary) request, a medication refusal, or any error response.

`predesign(hunchId)`:

1. Read the hunch's hypothesis and parameters. Shape from `schedulable`; for observational, the exposure label from the stored exposure parameter. **Observational with no labelled exposure: stop** — the user names it on the gate, and there is nothing to design yet.
2. Compute the fingerprint; upsert the row to `{ fingerprint, status: "designing", result: null }`.
3. Run `designProtocol` — the same function the route calls.
4. Write `{ status: "ready", result }`, or `{ status: "failed" }` on a throw, with `updateMany where { hunchId, fingerprint }`. **If the fingerprint has moved on, write nothing**: a re-sharpen started a newer design while this one ran, and the newer one owns the row.
5. Never throw. Errors are logged as `[predesign] failed` and end in step 4's `failed` write. A deleted hunch makes the upsert or the final write fail or match nothing; that is caught and dropped.

`untimed` is a new export from `src/lib/timing.ts` that runs a function outside the request's AsyncLocalStorage record (`requests.exit`). An `after()` callback inherits the request's async context, so without it the designer and safety steps would be pushed into a record whose `Server-Timing` header has already been sent.

### 4. Using the draft on confirm

`POST /api/hunch/[id]/protocol` keeps every existing check — auth, ownership, not-yet-sharpened, logged days, started trial, parameter validation, missing exposure — in its current order. Then, where it now calls `designProtocol`:

```ts
const fingerprint = designFingerprint({ ...hypothesis, shape, exposureLabel });
const result =
  (await timed("draft", () => takeDraft(hunch.id, fingerprint))) ??
  (await designProtocol({ ... })); // unchanged
```

`takeDraft(hunchId, fingerprint)` returns a `DesignResult` or `null`:

| Draft                                                  | Returns                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| no row, or fingerprint differs                         | `null`                                                                  |
| `ready`                                                | `result` parsed with `designResultSchema`; `null` if it does not parse  |
| `designing`, `updatedAt` within the last 30s           | poll the row every 250ms, up to 12s; its `result` if it turns `ready`, else `null` |
| `designing`, `updatedAt` older than 30s                | `null` — the background work was cut off                               |
| `failed`                                               | `null`                                                                  |

Waiting on an in-flight draft never costs more than designing inline would: the draft started earlier, so it has less than a full design left to run. That is why the 12s cap sits above one design's measured cost (~7.4s after the slim designer, worst sample 8.9s) — a cap below it would elapse on a near-miss and design inline anyway, paying both. The cap only bounds a row whose background work died without being marked stale.

The draft is **consumed**: `tx.designDraft.deleteMany({ where: { hunchId } })` inside the existing protocol transaction. "Try again" after a failure, or a later redesign, designs fresh rather than replaying a stored verdict.

The response body is unchanged, so `protocol-view.tsx` and `use-design-protocol.ts` need nothing.

## Edge cases

| Case                                                   | What happens                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Hunch deleted while designing                          | Cascade removes the draft; the guarded write matches nothing. The model spend is wasted.       |
| Re-sharpened while designing                           | New fingerprint upserted; the old run's final write is skipped.                                |
| Gate flips shape or renames the exposure               | Fingerprint mismatch → inline design, as today.                                                |
| Confirm after days were logged / trial started         | Existing 409s return before `takeDraft` runs.                                                  |
| Two tabs confirm together                              | The first consumes the draft; the second finds no row and designs inline, as today.           |
| Model error (including OpenRouter 402)                 | `failed` draft → inline design on confirm, which returns the 502 from `2e6c5ad` if it fails too. |
| Serverless function limit                              | Sharpen (~10s) plus a design (~5s after #4) inside the same invocation, well under the default. |
| User never confirms                                    | One design's spend (~$0.01 after #4) per abandoned hunch. Rows stay until the hunch is deleted. |

## Testing

All unit tests, mocked, no model calls. TDD.

- **`designFingerprint`** — stable for equal input; each included field changes it; the tracker list is not an input; `exposureLabel` counts only for observational; bumping `DESIGN_VERSION` changes it; surrounding whitespace on the label does not.
- **`predesign`** — `designing` then `ready` with the result; a throwing `designProtocol` ends `failed` and does not throw; observational without a labelled exposure never calls `designProtocol`; a fingerprint changed mid-run skips the final write.
- **`takeDraft`** — one test per row of its table; fake timers for the polling rows.
- **Protocol route** — a matching `ready` draft is used, `designProtocol` is not called, the draft is deleted inside the transaction; a mismatched or absent draft calls `designProtocol` with today's arguments.
- **Sharpen routes** — both schedule `after` on success; neither does for `observeOnly`, a 422 refusal, or a 502.
- **`untimed`** — a `timed` step inside it records nothing on the enclosing request.

No eval changes: the design itself is `designProtocol`, unchanged by this work.

## Measuring it

Bench changes (`scripts/bench-hunch-flow.ts`), needing OpenRouter credits to run:

- `--read-pause <seconds>`, default 8: sleep between W2 and W3, standing in for reading the gate.
- A `draft` column on W3 rows: `hit` (no designer/safety steps, `draft` step present), `wait` (`draft` step longer than ~250ms), `miss` (designer or safety steps present).
- Two runs: `--read-pause 8` for the hit path, `--read-pause 0` for the wait path.

**Success:** W3 under ~300ms median on hits. Wait-path W3 no slower than the post-#4 inline W3.

## Out of scope

- Re-designing when the gate flips shape or renames the exposure. Rarer; falls back to inline.
- Any UI change — progress, "ready" hints, or showing the plan before confirm.
- Retries, cancellation, and a dashboard (the Inngest alternative's strengths). The inline fallback absorbs every failure they would guard against.
- Cleaning up unconsumed drafts. One small row per abandoned hunch, deleted with the hunch.

## Alternatives weighed

- **Inngest function on a `hunch/sharpened` event.** Retries, `cancelOn` for re-sharpens, singleton concurrency, dashboard visibility; Inngest is already wired for reminders. Rejected: a round trip through Inngest Cloud before designing starts, and locally the draft only appears when `inngest-cli dev` is running — without it the feature silently does nothing. Its reliability guards against failures the inline fallback already absorbs.
- **The plan page requests a pre-design on load.** Smallest server change. Rejected: only runs while a tab is open, duplicates across tabs, and starts later than `after()` — the page loads after the sharpen response arrives.
- **Store the draft as a Protocol row with a draft state.** No new table. Rejected: every reader of `Protocol` — the hunch read behind the plan page, and the start, observe, repeat, belief and verdict routes — would need to learn to ignore it, and missing one exposes an unconfirmed plan.
