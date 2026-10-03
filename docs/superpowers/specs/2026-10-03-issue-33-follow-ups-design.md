# Issue #33 follow-ups — design

Date: 2026-10-03 · Branch: `fix/issue-33-follow-ups` (off main `35ac4f3`) · Closes #33

## Goal

Close the seven open items in issue #33. Two themes: an observational trial's
result must never be presented — in the app, the export, or the Coach's memory —
as anything stronger than "what went together"; and the stored tracker data must
agree with what the UI lets the user log.

Success: every item has a test that fails on main and passes on the branch;
full suite, lint and typecheck green; the observational export, dashboard and
plan checked live in the browser.

## Decisions (settled with owner, 2026-10-03)

- **#2:** mark observational edges correlational (new column), don't skip them.
- **#5:** refuse retiring the yes/no on every shape, not only observational.
- Everything else as designed below.

## A. Memory and data

### #2 — Observational verdicts are stored as correlational

- Migration: `CausalEdge.kind String @default("causal")`. Values `"causal"` |
  `"correlational"`. Existing rows stay `"causal"` (every existing edge came
  from a verdict; observational ones written before this change are not
  back-filled — there is no deployment, and the dev DB can be re-seeded).
- `writeEdgeData` takes `shape: ProtocolShape` (required, so no caller can forget
  it) and returns `kind: "correlational"` when `shape === "observational"`.
  `concludeTrial` (`src/lib/conclude-trial.ts`) passes the stored design's shape.
- `priorSchema` / `Prior` gain `kind`; `toPriors` copies it.
- Coach prompt (`hypothesis-coach.ts`, priors block): split into two lists,
  each omitted when empty:
  - "The user has already learned these related findings; take them into
    account, do not contradict them:" — causal only.
  - "These went together in the user's own logs, but were never tested — treat
    them as leads, not facts:" — correlational only.
- Clarifier prompt (`clarifier.ts`): same split. Causal: "don't ask about them
  again" (unchanged). Correlational: "went together but untested — fine to ask
  about".

### #7 — Scale ranges are always 1–5 when stored

- `normalizeScale<T extends { type; unit?; min?; max? }>(p: T): T` in
  `src/lib/parameters.ts`: for `type === "scale"` returns
  `{ ...p, unit: "1-5", min: SCALE_MIN, max: SCALE_MAX }`; other types untouched.
- Applied at every write: `draftsFromSharpened`, `POST /api/hunch/[id]/protocol`
  (the `createMany`), `POST /api/hunch/[id]/parameters`.
- The same migration rewrites existing scale rows:
  `UPDATE "Parameter" SET unit='1-5', min=1, max=5 WHERE type='scale'`.

## B. What the user reads

### #1 — Export speaks the observational trial's own terms

- Export route builds `exposureReport(checkIns, pickExposure(parameters), shape)`
  and passes it, plus `shape`, into `ExportHunch`.
- `toText` (`src/lib/export.ts`):
  - headline via the three-argument `verdictHeadline` (as the verdict card),
  - observational: "N yes-days, M no-days" in place of
    "N baseline days, M intervention days", followed by `observationalCaveat`,
  - phased: unchanged counts, plus `exposureSummary` when present.
- Rule: every sentence the export writes about the verdict comes from the same
  helper the verdict card uses.

### #3 — The meter doesn't read as causal on an observational trial

- `BeliefMeter` gains `observational?: boolean`. When true the heading reads
  "Likelihood they go together" instead of "Likelihood it's real". The words
  come from a pure `beliefHeading(observational)` in `src/lib/verdict.ts`, so
  they are unit-tested (the repo has no component test setup).
- Dashboard passes it from the exposure report's `observational` flag and
  renders `observationalCaveat(exposure)` under the meter, as `verdict.tsx` does.
  The verdict view passes the same prop.

### #4 — The observational plan's instructions: no change (found while planning)

The issue says the Designer writes `design.instructions` and the card throws
it away. Since #35 the model writes none of it: `composeInstructions`
(`protocol-designer.ts`) builds it from the phases, washout and controls, and
its doc says "No screen shows it; the safety reviewer reads it". The card
already renders every part — phase name, action, days, what to log, controls —
so rendering `instructions` would print the same plan twice. Closed on #33 with
this explanation; no code.

## C. Rules and Coach

### #5 — The yes/no can't be retired mid-trial

- Retire route: `parameter.isExposure && retired` → 409 on every shape (drop the
  shape lookup). Message: "This is how we know whether the change happened — it
  has to keep running."
- `tracker-editor.tsx`: hide "Stop tracking" for `p.isExposure` regardless of
  shape (the `observational` prop stays for its other use, if any; removed if
  it becomes unused).
- Retiring any other tracker is unchanged. Comments that describe the old
  phased exception are updated.

### #6 — Tracker padding

- Measure first: run the Coach eval over ~6 varied hunches, record tracker counts.
- If counts are flat 4: tighten the trackers instruction (e.g. require each
  tracker to name what it would explain about the outcome; zero is a fine
  answer) and re-measure.
- Either way, add an eval assertion (live model, `*.eval.test.ts`): across the
  set, counts are not all 4. Record before/after counts in the plan.

## Testing

Unit: `writeEdgeData` kind per shape; `toPriors` carries kind; Coach and
Clarifier prompt split (both, either, neither); `normalizeScale` plus each write
path; export text for phased and observational; retire 409 on phased exposure;
`beliefHeading` both ways. Vitest runs `*.test.ts` in node only — no component
tests; the dashboard caveat, the meter heading and the tracker editor's hidden
control are checked live. Eval: tracker count spread. Live: an observational
trial's export and dashboard, and a phased trial's tracker editor.

## Out of scope

Back-filling `kind` on old observational edges; any change to how verdicts are
computed; UI for browsing stored findings.
