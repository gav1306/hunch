# Intervention Adherence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop labelling a day "intervention" because the calendar says so. For a hunch whose change cannot be applied on demand, sort each day into an arm by whether the change actually happened — and say out loud, on every trial that carries an exposure, how many days it happened on.

**Architecture:** One bit on the hypothesis (`schedulable`), one flag on a parameter (`isExposure`), one field on the design (`shape`). A schedulable hunch keeps today's ABA design untouched. A non-schedulable one gets a single 21-day observation window and the engine derives its arms at read time from the exposure reading. The arm is **never stored** — `CheckIn.phase` keeps being written by the schedule, because loggability, the day counter and "done" all read it.

**Tech Stack:** Next.js App Router, Prisma/Postgres, Zod v4, Mastra agents (Claude via OpenRouter), Vitest, TanStack Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-09-intervention-adherence-design.md`

## Global Constraints

- **Test-first** for the engine, the schemas and the design builder (RULES.md §3). Glue and UI get at minimum a typecheck/lint gate.
- **No new dependencies.** Nothing here needs one (RULES.md §1).
- **The arm is derived at read time, never stored.** `CheckIn.phase` keeps being written by the schedule in the check-in route. Nothing in this plan changes what that column holds.
- **No running trial changes shape.** The decision is made before a trial starts; there is no path that re-shapes a started one.
- **The exposure parameter is always `binary`, never the primary, at most one per hunch.**
- **Copy never claims causation.** An observational verdict carries the correlational line once, in the user's own words. No disclaimer voice, no medical advice (RULES.md §6).
- **`OBSERVATION_DAYS = 21`**, chosen against the existing `MIN_PER_ARM = 3` in `src/lib/verdict.ts`. Do not change `MIN_PER_ARM`.
- **After any `prisma/schema.prisma` change:** `npx prisma generate`, then `rm -rf .next`, then restart the dev server. The client has a custom output path (`src/generated/prisma`) and Turbopack caches the old one.
- **The owner commits** (RULES.md §2). Each task ends green — `npm test`, `npm run typecheck`, `npm run lint` — and reports "ready to commit" with a Conventional Commits message. **No commit trailers.**
- Model-calling evals live in `*.eval.test.ts` and run under `npm run test:eval`; they self-skip without `OPENROUTER_API_KEY`.

---

### Task 1: `shape` on the design

**Files:**
- Modify: `src/lib/schemas/protocol.ts`
- Test: `src/lib/schemas/protocol.test.ts`

**Produces:**
- `protocolShapeSchema = z.enum(["phased", "observational", "diary"])`, `type ProtocolShape`
- `protocolDesignSchema` gains `shape: protocolShapeSchema.default("phased")`
- `parseStoredDesign` derives `shape` for rows written before the field existed
- `observeOnlyDesign()` now returns `shape: "diary"`

- [ ] **Step 1: Write the failing tests** in `protocol.test.ts`:
  - a stored design with three phases and **no** `shape` key parses to `shape: "phased"`
  - a stored design with one phase and **no** `shape` key parses to `shape: "diary"`
  - a stored design carrying `shape: "observational"` with one phase keeps `"observational"` (derivation must not overwrite an explicit value)
  - `observeOnlyDesign("hours of sleep").shape === "diary"`
  - a design object with no `shape` passed straight to `protocolDesignSchema.parse` defaults to `"phased"` (so every existing writer stays valid)
- [ ] **Step 2: Run and watch them fail** — `npx vitest run src/lib/schemas/protocol.test.ts`
- [ ] **Step 3: Implement.** Add the enum above `protocolPhaseSchema`. Add the field to `protocolDesignSchema`. In `parseStoredDesign`, derive **before** parsing, so the schema default cannot mask a legacy diary:

```ts
const stored = (obj as { shape?: unknown }).shape;
const shape =
  typeof stored === "string"
    ? stored
    : Array.isArray(phases) && phases.length === 1
      ? "diary"
      : "phased";
return protocolDesignSchema.parse({ ...(obj as object), phases, shape });
```

- [ ] **Step 4: Correct the two stale comments** the spec calls out. The block comment on `protocolDesignSchema` (currently "`phases.length === 1` is now what marks a design that produces no verdict") and the one on `observeOnlyDesign` ("What marks a diary is `phases.length === 1`, and that is what the code checks") are both false: every real check is `safetyState === "observe-only"` (`src/app/api/hunch/[id]/verdict/route.ts:88`, `src/components/hunch/hunch-dashboard.tsx:57`). Rewrite them to say: `safetyState` answers "may this run, and is it a diary?"; `shape` answers "what kind of design is this?" for the engine and the Designer. An observational trial is also one phase and was never at risk of being read as a diary.
- [ ] **Step 5: Run the tests and watch them pass.** Then `npm test` — nothing else should move.
- [ ] **Step 6: Ready to commit** — `feat(protocol): name the shape of a design`

---

### Task 2: The observational design

**Files:**
- Modify: `src/lib/schemas/protocol.ts`
- Test: `src/lib/schemas/protocol.test.ts`

**Interfaces:**
- Consumes: `protocolShapeSchema`, `ProtocolDesign` (Task 1)
- Produces: `OBSERVATION_DAYS = 21`; `observationalDesign(outcomeMetric: string, exposureLabel: string): ProtocolDesign`

- [ ] **Step 1: Write the failing tests:**
  - exactly one phase, `label: "A"`, `kind: "baseline"`, `days: 21`
  - `washoutDays === 0`
  - `shape === "observational"`
  - the phase `action` contains both the exposure label and the outcome metric verbatim
  - `instructions` is non-empty and the whole object satisfies `protocolDesignSchema`
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Implement**, next to `observeOnlyDesign`, deterministic for the same reason — the LLM is not asked to invent a structure with no phases in it:

```ts
/**
 * How long an observational window runs.
 *
 * 21 days is chosen against MIN_PER_ARM (3) in src/lib/verdict.ts: a
 * once-a-week exposure clears the floor with a day to spare, twice a week
 * clears it comfortably. Shorter windows make "not enough days" the common
 * verdict for trials that were run perfectly.
 */
export const OBSERVATION_DAYS = 21;

/**
 * The protocol for a hunch whose change cannot be scheduled. One window, no
 * washout — the user is living normally throughout — and the arms come from
 * the daily exposure answer rather than from the calendar. See armRows().
 */
export function observationalDesign(
  outcomeMetric: string,
  exposureLabel: string,
): ProtocolDesign {
  return {
    phases: [
      {
        label: "A",
        kind: "baseline",
        days: OBSERVATION_DAYS,
        name: "Just live normally",
        action:
          `Live as you normally would. Each day, log "${exposureLabel}", and ` +
          `log ${outcomeMetric}.`,
      },
    ],
    washoutDays: 0,
    controls: [],
    instructions:
      `Nothing about your routine changes for this one. Each day you answer one ` +
      `yes/no question — "${exposureLabel}" — and log ${outcomeMetric}. At the end ` +
      `we compare the days it happened against the days it didn't.`,
    shape: "observational",
  };
}
```

- [ ] **Step 4: Run and watch pass.** Confirm by reading, not by changing: `currentPhase`, `adherenceStrip`, `totalDays` and the check-in's loggability rules need no work here — they already walk a one-phase design correctly, because a diary is one.
- [ ] **Step 5: Ready to commit** — `feat(protocol): a design for a change you cannot schedule`

---

### Task 3: `schedulable` and `exposure` on the sharpened hypothesis

**Files:**
- Modify: `src/lib/schemas/hypothesis.ts`
- Test: `src/lib/schemas/hypothesis.test.ts`

**Produces:** `sharpenedHypothesisSchema` gains `schedulable: boolean` (default `true`) and `exposure?: Tracker`, with two refinements.

- [ ] **Step 1: Write the failing tests:**
  - a hypothesis with neither field parses, and `schedulable` comes back `true` (every hypothesis written before this field was a scheduled trial)
  - `schedulable: false` with `exposure: { label: "Played basketball", type: "binary" }` parses
  - `schedulable: false` with no `exposure` **fails**
  - `schedulable: false` with `exposure: { label: "...", type: "scale", unit: "1-5", min: 1, max: 5 }` **fails** — "Did it happen today?" has no scale, and a scale exposure has no arm boundary
  - `schedulable: true` with a binary `exposure` parses (reporting-only adherence — §6 of the spec)
  - `sharpenedHypothesisSchema.shape` still exposes the field keys after the refinements (guards the structured-output path — see Step 4)
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Implement:**

```ts
  /**
   * Can the person apply this change on any day they choose? "Skip coffee
   * after 2pm" — yes. "Play basketball" — no: it needs other people, a court,
   * and a body that feels like playing. A false here means the trial gets one
   * observation window and its arms come from what actually happened, because
   * scheduling a pickup game is asking the user to fake it.
   */
  schedulable: z.boolean().default(true),
  /**
   * The daily yes/no that says whether the change happened. Required when the
   * hunch is not schedulable — it is the arm assignment. Optional on a
   * schedulable one, where it is the adherence count and never touches an arm.
   */
  exposure: trackerSchema.optional(),
})
  .refine((h) => h.schedulable || h.exposure !== undefined, {
    message: "A change that can't be scheduled needs a daily yes/no to tell its days apart.",
    path: ["exposure"],
  })
  .refine((h) => h.exposure === undefined || h.exposure.type === "binary", {
    message: "An exposure is a yes/no — did it happen today?",
    path: ["exposure", "type"],
  });
```

- [ ] **Step 4: Confirm the object shape survives.** Zod v4 keeps `.refine()` on the same schema object, so `structuredOutput: { schema: sharpenedHypothesisSchema }` in `sharpenHunch` still converts. If the shape test in Step 1 fails, split instead: keep `sharpenedHypothesisFields` as the plain `z.object({...})` and pass **that** to `structuredOutput`, and export `sharpenedHypothesisSchema = sharpenedHypothesisFields.refine(...).refine(...)` for validation. Update the `sharpenHunch` call accordingly.
- [ ] **Step 5: Run and watch pass.**
- [ ] **Step 6: Ready to commit** — `feat(hypothesis): ask whether the change can be scheduled`

---

### Task 4: Teach the Coach the question, and evaluate it

**Files:**
- Modify: `src/mastra/agents/hypothesis-coach.ts`
- Test: `src/mastra/agents/hypothesis-coach.test.ts`, `src/mastra/agents/hypothesis-coach.eval.test.ts`

**Interfaces:**
- Consumes: `sharpenedHypothesisSchema` (Task 3)
- Produces: `sharpenHunch` returns a hypothesis whose `schedulable`/`exposure` pair is always internally consistent.

- [ ] **Step 1: Write the failing unit test** in `hypothesis-coach.test.ts` for the normalisation function (export it so it is testable without a model call):

```ts
// A model that says "not schedulable" but forgets the exposure would 502 the
// whole sharpen. Fall back to the scheduled design, which is exactly today's
// behaviour, and let the user flip it on the confirm gate — which is where the
// exposure label gets asked for anyway.
export function normaliseSchedulability(h: SharpenedHypothesis): SharpenedHypothesis
```
  - `{ schedulable: false, exposure: undefined }` → `{ schedulable: true, exposure: undefined }`
  - `{ schedulable: false, exposure: binary }` → unchanged
  - `{ schedulable: true, exposure: binary }` → unchanged
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Implement** `normaliseSchedulability`, call it in `sharpenHunch` **before** `sharpenedHypothesisSchema.parse(...)` (the parse would otherwise throw on the inconsistent pair), and `console.warn` when it fires.
- [ ] **Step 4: Add the prompt rules** to the agent instructions, after the `subject` rule:

```
- schedulable: can this person apply the change on ANY day they choose? "Skip
  coffee after 2pm", "10k steps", "magnesium at bedtime" — yes, true. "Play
  basketball", "go to the sauna", "have a big night out" — no, false: those
  need other people, a place, or an opportunity that does not arrive on
  request. Ask yourself whether a calendar could put it on a Tuesday. If it
  could not, say false.
- exposure: the daily yes/no that says whether the change happened, as
  { label, type: "binary" }. REQUIRED whenever schedulable is false — it is how
  the days get told apart. Also give one when schedulable is true AND the change
  is a discrete act someone could skip ("Skipped coffee after 2pm", "Took my
  walk"); leave it out when the phase itself is the whole story ("slept with the
  window open"). Label it as the person would tick it off: "Played basketball",
  "Went to the sauna". Never a scale, never a duration, never the outcome metric
  restated.
```

- [ ] **Step 5: Add two eval cases** to `hypothesis-coach.eval.test.ts`, following the daily-loggable rule added in PR #32:

```ts
  test.each([
    "i think skipping coffee after lunch helps me sleep",
    "magnesium before bed settles me down",
  ])("keeps %s schedulable", async (raw) => {
    const h = await sharpenHunch(raw);
    expect(h.schedulable).toBe(true);
  }, 120_000);

  test.each([
    "my knee hurts after playing basketball",
    "the sauna wrecks my sleep that night",
  ])("marks %s as opportunity-dependent, with an exposure", async (raw) => {
    const h = await sharpenHunch(raw);
    expect(h.schedulable).toBe(false);
    expect(h.exposure?.type).toBe("binary");
    expect(h.exposure?.label.trim().length ?? 0).toBeGreaterThan(2);
    // The exposure is the change, not the outcome restated.
    expect(h.exposure?.label.toLowerCase()).not.toBe(h.outcomeMetric.toLowerCase());
  }, 120_000);
```

- [ ] **Step 6: Run** `npm test` (unit) and `npm run test:eval -- hypothesis-coach` with a key present. Report both results honestly; an eval that needs prompt iteration is iterated here, not deferred.
- [ ] **Step 7: Ready to commit** — `feat(coach): decide whether a change can be scheduled`

---

### Task 5: Persist the bit and the flag

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260909120000_intervention_adherence/migration.sql`
- Modify: `src/lib/schemas/parameter.ts` (the `isExposure` field only — its refinements are Task 6)
- Modify: `src/lib/parameters.ts` (`ParameterRow`, `toParameterDto`, `draftsFromSharpened`)
- Modify: `src/app/api/hunch/route.ts`, `src/app/api/hunch/[id]/sharpen/route.ts`, `src/app/api/hunch/[id]/route.ts`
- Modify: `src/hooks/use-hunch-info.ts`
- Test: `src/lib/parameters.test.ts`

**Interfaces:**
- Consumes: `SharpenedHypothesis.exposure` (Task 3)
- Produces: `Hypothesis.schedulable`, `Parameter.isExposure`; `parameterDraftSchema` gains `isExposure: z.boolean().default(false)` (so `parameterSchema` and the API DTO inherit it); `draftsFromSharpened` emits an exposure draft; `GET /api/hunch/[id]` returns `hypothesis.schedulable`.

- [ ] **Step 1: Write the failing tests** for `draftsFromSharpened` in `parameters.test.ts`:
  - with no `exposure`, output is unchanged from today (primary + up to four trackers)
  - with an `exposure`, the second row is `{ label, type: "binary", isPrimary: false, isExposure: true }` and the primary is still first
  - an exposure whose label matches the primary's is dropped (same `sameLabel` rule as trackers)
  - a tracker whose label matches the exposure's is dropped — the user must never see the same daily question twice
  - with an exposure, trackers are capped at **three**, so the total stays inside `MAX_ACTIVE_PARAMETERS` (5)
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Add the columns** to `prisma/schema.prisma`:

```prisma
model Hypothesis {
  ...
  /// Can the user apply this change on any day they choose? False means the
  /// trial is one observation window and its arms come from the exposure
  /// parameter, not the schedule. Every hypothesis written before this field
  /// was built as a scheduled trial, which is what the default says.
  schedulable   Boolean  @default(true)
}

model Parameter {
  ...
  /// The daily yes/no that says whether the change happened. On an
  /// observational trial this is the arm assignment; on a phased one it is the
  /// adherence count and never moves a day. At most one per hunch, always
  /// binary, never the primary.
  isExposure Boolean @default(false)
}
```

- [ ] **Step 4: Write the migration** by hand at `prisma/migrations/20260909120000_intervention_adherence/migration.sql`:

```sql
-- Additive only. Every existing hypothesis was built as a scheduled trial and
-- every existing parameter is an outcome or a context tracker.
ALTER TABLE "Hypothesis" ADD COLUMN "schedulable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Parameter" ADD COLUMN "isExposure" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 5: Apply and regenerate** — `npx prisma migrate dev`, then `npx prisma generate`, `rm -rf .next`, restart dev.
- [ ] **Step 6: Implement the code changes:**
  - `parameterDraftSchema` gains `isExposure: z.boolean().default(false)`, documented as "the daily yes/no that tells this trial's days apart". The list refinements that police it are Task 6 — this step only makes the field exist, because `draftsFromSharpened` below emits it.
  - `ParameterRow` gains `isExposure: boolean`; `toParameterDto` maps it through.
  - `draftsFromSharpened` takes `exposure?: Tracker` and emits the row described in Step 1.
  - `POST /api/hunch` and `POST /api/hunch/[id]/sharpen`: write `schedulable: sharpened.schedulable` into `hypothesisData`, pass `sharpened.exposure` into `draftsFromSharpened`, and persist `isExposure: d.isExposure ?? false` in the `parameter.create` payloads. Re-sharpening rewrites both, the same way it already rewrites `expectedDirection`.
  - `GET /api/hunch/[id]`: add `schedulable: hunch.hypothesis.schedulable` to the `hypothesis` object it returns.
  - `use-hunch-info.ts`: `HunchInfo["hypothesis"]` gains `schedulable: boolean`.
- [ ] **Step 7: Run** `npm test` and `npm run typecheck`.
- [ ] **Step 8: Ready to commit** — `feat(db): persist schedulability and the exposure flag`

---

### Task 6: `isExposure` on the parameter schemas

**Files:**
- Modify: `src/lib/schemas/parameter.ts`
- Modify: `src/app/api/hunch/[id]/parameters/route.ts`
- Test: `src/lib/schemas/parameter.test.ts`

**Interfaces:**
- Consumes: `parameterDraftSchema.isExposure` (Task 5)
- Produces: `parameterListSchema` gains three refinements.

- [ ] **Step 1: Write the failing tests** against `parameterListSchema`:
  - a list with one primary and one binary exposure passes
  - two rows with `isExposure: true` fail — "It is the arm assignment; two of them is not a design this engine has"
  - an exposure with `type: "scale"` fails
  - a row with both `isPrimary` and `isExposure` fails — one row cannot be both sides of the contrast
  - a list with no exposure still passes (schedulable trials need none)
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Implement** the three refinements, each with its own message:

```ts
  .refine((rows) => rows.filter((r) => r.isExposure).length <= 1, {
    message: "Only one daily yes/no can split your days.",
  })
  .refine((rows) => rows.every((r) => !r.isExposure || r.type === "binary"), {
    message: "The question that splits your days is a yes/no.",
  })
  .refine((rows) => rows.every((r) => !(r.isExposure && r.isPrimary)), {
    message: "Your main measure can't also be the thing it's compared across.",
  })
```

- [ ] **Step 4:** In `POST /api/hunch/[id]/parameters` (the mid-trial add), pass `isExposure: false` explicitly next to the existing `isPrimary: false`, with the same reasoning in a comment: a running trial's arms are settled, and a new tracker starts empty.
- [ ] **Step 5: Run and watch pass**, then `npm test`.
- [ ] **Step 6: Ready to commit** — `feat(parameters): mark the day-splitting question`

---

### Task 7: The engine reads arms, not phases

**Files:**
- Modify: `src/lib/parameters.ts`
- Modify: `src/app/api/hunch/[id]/belief/route.ts`, `src/app/api/hunch/[id]/verdict/route.ts`, `src/app/api/hunch/[id]/checkin/route.ts`
- Test: `src/lib/parameters.test.ts`

**Interfaces:**
- Consumes: `ProtocolShape` (Task 1)
- Produces (replaces `primaryBeliefRows`, which is deleted):

```ts
export function armRows(
  checkIns: CheckInWithValues[],
  primaryId: string | null | undefined,
  opts: { shape: ProtocolShape; exposureId?: string | null } = { shape: "phased" },
): CheckInRow[]
```

- [ ] **Step 1: Write the failing tests:**
  - **phased passthrough** — `{ shape: "phased" }` returns exactly what `primaryBeliefRows` returned: one row per day carrying a primary reading, `phase` as stored
  - **observational sorting** — `{ shape: "observational", exposureId }`: a day whose exposure reading is `1` becomes `phase: "B"`, `0` becomes `"A"`, regardless of the stored `phase`
  - **stored phase ignored** — an observational day stored as `phase: "B"` with exposure `0` comes back as `"A"`. This is the whole bug.
  - **unknown exposure dropped** — an observational day with a primary reading and no exposure reading produces **no row**. An unanswered question is not a "no": treating it as one stuffs every lazy check-in into the baseline arm.
  - **missing primary** — a day with no primary reading produces no row, either shape (unchanged behaviour)
  - **no primaryId** — returns `[]` (unchanged)
  - **observational with no exposureId** — returns `[]`, because there are no arms at all; the route must never reach this, and silently returning phase-sorted rows would resurrect the bug
  - **a corrected exposure moves the day** — same day, exposure flipped `1` → `0`, arm flips `"B"` → `"A"`
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Implement**, replacing `primaryBeliefRows`. Keep the existing doc comment's point about trackers never reaching the statistics, and add:

```ts
/**
 * Project day-buckets down to what the Bayesian engine consumes: the primary
 * reading per day, tagged with the arm that day belongs to.
 *
 * The arm is derived here and never stored. `CheckIn.phase` is the calendar's
 * answer — the check-in route writes whatever the schedule says the date is —
 * and on an observational trial that label carries no arm meaning at all.
 * Deriving is also what makes a correction work: the adherence strip lets a
 * user fix yesterday's "did I play?", and a stored arm would go stale the
 * moment they did.
 */
```

- [ ] **Step 4: Update the three call sites.** Each already parses the design (or can): pass `{ shape: design.shape, exposureId: hunch.parameters.find((p) => p.isExposure)?.id ?? null }`.
  - `belief/route.ts` — the design is parsed only when `startedAt` is set; parse it (defaulting `shape` to `"phased"` when there is no protocol) **before** computing the belief.
  - `verdict/route.ts` — move the `parseStoredDesign` call above the `computeBelief` call.
  - `checkin/route.ts` — `design` is already in scope above the belief computation.
- [ ] **Step 5: Run** `npm test` and `npm run typecheck`. Grep for `primaryBeliefRows` and confirm zero hits.
- [ ] **Step 6: Ready to commit** — `feat(engine): sort days by what happened, not by the calendar`

---

### Task 8: The counts, and the words for them

**Files:**
- Modify: `src/lib/parameters.ts`, `src/lib/schemas/verdict.ts`, `src/lib/verdict.ts`
- Test: `src/lib/parameters.test.ts`, `src/lib/verdict.test.ts`

**Interfaces:**
- Produces:

```ts
// src/lib/schemas/verdict.ts
export const exposureReportSchema = z.object({
  label: z.string().trim().min(1),
  exposed: z.number().int().min(0),
  unexposed: z.number().int().min(0),
  unknown: z.number().int().min(0),
  /** True when these counts assigned the arms, rather than the schedule. */
  observational: z.boolean(),
});
export type ExposureReport = z.infer<typeof exposureReportSchema>;

// src/lib/parameters.ts
export function exposureReport(
  checkIns: CheckInWithValues[],
  exposure: { id: string; label: string } | null | undefined,
  shape: ProtocolShape,
): ExposureReport | null

// src/lib/verdict.ts
export function exposureSummary(e: ExposureReport): string
export function exposureDropped(e: ExposureReport): string | null
export function observationalCaveat(e: ExposureReport): string
export function verdictHeadline(
  category: VerdictCategory,
  outcome: VerdictOutcome | null,
  exposure?: ExposureReport | null,
): string
```

- [ ] **Step 1: Write the failing tests for `exposureReport`:**
  - `null` when `exposure` is null — a hunch without one reports nothing
  - **observational** — counts over the whole window: 6 days with `1`, 12 with `0`, 3 logged days with no exposure reading → `{ exposed: 6, unexposed: 12, unknown: 3, observational: true }`
  - **phased** — counts over the **phase-B days only**: a day stored `phase: "A"` with exposure `1` is not counted at all, because the schedule assigned that day and the count is answering "was phase B adhered to?"
  - **diary** — same as phased (no B days, so all zeroes), `observational: false`
  - the `label` is carried through verbatim
- [ ] **Step 2: Write the failing tests for the copy** in `verdict.test.ts`:
  - `exposureSummary({ label: "Played basketball", exposed: 6, unexposed: 12, unknown: 3, ... })` → `"Played basketball on 6 of 21 logged days."` (the denominator is every logged day, including the unanswered ones — they were days of the trial)
  - `exposureDropped` returns `null` when `unknown === 0`
  - `exposureDropped` with `unknown: 1` → `"1 day had no answer either way, so it isn't in the comparison."`
  - `exposureDropped` with `unknown: 3` → `"3 days had no answer either way, so they aren't in the comparison."`
  - `observationalCaveat` names the label and contains "what went together, not what caused what"
  - `verdictHeadline("inconclusive_insufficient", outcome)` is unchanged: `"Not enough days to tell"`
  - `verdictHeadline("inconclusive_insufficient", outcome, observationalReport)` → `` `Too few days either side of "Played basketball"` `` — because "not enough days" is false when the user logged all twenty-one of them; the cause is the split, not the logging
  - `verdictHeadline("inconclusive_insufficient", outcome, phasedReport)` (i.e. `observational: false`) falls back to `"Not enough days to tell"` — on a scheduled trial, missing days really are missing days
  - the other three categories ignore the third argument entirely
- [ ] **Step 3: Run and watch both files fail.**
- [ ] **Step 4: Implement.** In `verdict.ts` reuse the existing `sentenceStart` / `midSentence` helpers so a label typed by the user reads as a sentence:

```ts
/** "Played basketball on 6 of 21 logged days." */
export function exposureSummary(e: ExposureReport): string {
  const days = e.exposed + e.unexposed + e.unknown;
  return `${sentenceStart(e.label)} on ${e.exposed} of ${days} logged days.`;
}

/** Named only when days fell out of the comparison. */
export function exposureDropped(e: ExposureReport): string | null {
  if (e.unknown === 0) return null;
  return e.unknown === 1
    ? "1 day had no answer either way, so it isn't in the comparison."
    : `${e.unknown} days had no answer either way, so they aren't in the comparison.`;
}

/**
 * The one thing an observational trial must say about itself. Exposure is
 * self-selected — people play on days their knee already feels good — so this
 * is a correlation and the copy says so in the user's own words, once.
 */
export function observationalCaveat(e: ExposureReport): string {
  return (
    `These are the days you logged ${midSentence(e.label)} compared with the days ` +
    `you didn't — you chose which were which, so this shows what went together, ` +
    `not what caused what.`
  );
}
```

- [ ] **Step 5: Run and watch pass**, then `npm test`.
- [ ] **Step 6: Ready to commit** — `feat(verdict): count the days the change happened`

---

### Task 9: Carry the report on the belief and the verdict

**Files:**
- Modify: `src/lib/schemas/verdict.ts`, `src/app/api/hunch/[id]/belief/route.ts`, `src/app/api/hunch/[id]/verdict/route.ts`, `src/hooks/use-belief.ts`
- Test: `src/lib/schemas/verdict.test.ts`

**Interfaces:**
- Consumes: `exposureReport` (Task 8), `armRows` (Task 7)
- Produces: `verdictSchema` gains `exposure: exposureReportSchema.nullish()`; `BeliefResponse` gains `exposure: ExposureReport | null`.

- [ ] **Step 1: Write the failing schema test** — a verdict payload with `exposure` parses; one without it still parses (verdicts frozen before this existed carry none, exactly like `outcome`).
- [ ] **Step 2: Run and watch fail. Step 3: Add the field.**
- [ ] **Step 4: Belief route.** After the belief is computed, add to the JSON response:

```ts
exposure: exposureReport(hunch.checkIns, exposureParam, shape),
```
  where `exposureParam = hunch.parameters.find((p) => p.isExposure) ?? null` and `shape` is the parsed design's (defaulting to `"phased"` when there is no protocol). Add the field to `BeliefResponse` in `use-belief.ts`.
- [ ] **Step 5: Verdict route.** The report is computed on **both** paths, stored and fresh — it is read from the check-ins on every request, like `outcome`, not frozen into the row:
  - move `const design = hunch.protocol ? parseStoredDesign(...) : null` above the `hunch.verdict` early return
  - `toDto(row, outcome, report)` gains the third argument and puts it in the parsed object
  - the fresh path passes the same report into the `NextResponse.json({ verdict })` payload
  - **nothing is added to the `Verdict` Prisma model.** The counts change when a user corrects a day; a frozen copy would disagree with the strip above it.
- [ ] **Step 6: Verify by hand** against a seeded observational hunch: `curl` the belief endpoint and confirm `exposure` counts match the days you logged; correct one day's exposure through the strip and confirm the counts move.
- [ ] **Step 7:** `npm test`, `npm run typecheck`, `npm run lint`.
- [ ] **Step 8: Ready to commit** — `feat(api): report how many days the change happened`

---

### Task 10: Design an observational trial

**Files:**
- Modify: `src/mastra/agents/protocol-designer.ts`, `src/mastra/workflows/design.ts`, `src/app/api/hunch/[id]/protocol/route.ts`
- Test: `src/mastra/agents/protocol-designer.test.ts`, `src/mastra/workflows/design.test.ts`

**Interfaces:**
- Consumes: `observationalDesign` (Task 2), `parameterListSchema` refinements (Task 6), `Hypothesis.schedulable` (Task 5)
- Produces: `designProtocol` and `designProtocolShape` both accept `{ shape: ProtocolShape; exposureLabel?: string }`; `POST /api/hunch/[id]/protocol` accepts an optional `schedulable` boolean override.

- [ ] **Step 1: Write the failing tests** in `protocol-designer.test.ts`, against a stubbed agent response (the existing tests already stub `generate`):
  - with `shape: "observational"`, the returned design's phases, `washoutDays` and `shape` come from `observationalDesign` **even when the model returned three phases** — the phase structure is taken out of the model's hands
  - `controls` and `instructions` still come from the model when it supplied them
  - `instructions` falls back to `observationalDesign`'s when the model returned none
  - with `shape: "phased"`, behaviour is byte-for-byte what it is today
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Implement in `designProtocolShape`.** Take `shape` and `exposureLabel`; when observational, build the deterministic base first and overlay only the prose:

```ts
if (input.shape === "observational") {
  const base = observationalDesign(input.outcomeMetric, input.exposureLabel ?? "the change");
  return protocolDesignSchema.parse({
    ...base,
    controls: raw.controls?.length ? raw.controls : controls,
    instructions:
      typeof raw.instructions === "string" && raw.instructions.trim().length > 0
        ? raw.instructions
        : base.instructions,
  });
}
```

- [ ] **Step 4: Add the observational branch to the prompt.** The existing rule says "phases: exactly three"; it must not fire here. Build the prompt conditionally and, for the observational branch, send:

```
This person CANNOT schedule the change — it depends on an opportunity that does
not arrive on request. There are no phases to design and no washout: they live
normally for the whole window and log, each day, whether "<exposure label>"
happened. Do NOT invent phases, do NOT propose an ABA structure, and do NOT ask
them to do the thing on particular days. Return "controls" (the confounder
controls you are given, verbatim) and "instructions" for living normally and
logging both questions daily. Anything you return under "phases" is discarded.
```

- [ ] **Step 5: Thread it through `designProtocol`** — add `shape` and `exposureLabel` to its input, pass them to `designProtocolShape`. The safety review still runs on the resulting design, unchanged: an observational trial schedules no change, but the reviewer is the gate and it does not get skipped. `estimateTrialLength` still runs and its `powerInfo` is still stored — its `minDaysPerPhase` is simply unused when the window is fixed at 21 days; note that in a comment rather than storing a lie.
- [ ] **Step 6: The route.** In `POST /api/hunch/[id]/protocol`:
  - accept an optional `schedulable: boolean` in the body (the confirm gate's override) and, when it differs from the stored value, update `Hypothesis.schedulable` inside the same transaction
  - resolve `const observational = !schedulable`
  - when observational and the confirmed list has **no** `isExposure` row → `400` with `"Tell us the one yes/no we should ask each day — it's how we tell your days apart."`
  - when observational, pass `shape: "observational"` and the exposure row's label into `designProtocol`
  - persist `isExposure: p.isExposure` in the `createMany` payload
  - when the body says `schedulable: true`, drop any `isExposure` flag from the confirmed rows before persisting — flipping back to a scheduled design must not leave an arm-assigning parameter behind
  - **no new guard is needed against reshaping a running trial**: this route already refuses once any day is logged or `startedAt` is set, and those two refusals are what keep a shape from changing underneath someone's data. Confirm both still fire.
  - **the check-in needs no work.** The exposure is created as an ordinary parameter row, so `GET /belief` returns it among the active parameters and the check-in renders it as the binary control it already knows how to draw. The user sees a yes/no question; nothing in the interface says "exposure".
- [ ] **Step 7: Verify by hand.** Create a hunch the Coach marks non-schedulable, confirm the gate, and check the stored protocol: one phase, 21 days, `shape: "observational"`, zero washout, and a parameter row with `isExposure = true`.
- [ ] **Step 8:** `npm test`, `npm run typecheck`, `npm run lint`.
- [ ] **Step 9: Ready to commit** — `feat(protocol): design a window instead of phases when a change can't be scheduled`

---

### Task 11: An arm-assigning exposure can't be retired

**Files:**
- Modify: `src/app/api/hunch/[id]/parameters/[parameterId]/route.ts`
- Test: `src/app/api/hunch/[id]/parameters/[parameterId]/route.test.ts` (exists — extend it)

- [ ] **Step 1: Write the failing tests:**
  - retiring the exposure on an **observational** hunch → `409`, body `"This is how we tell your days apart — it has to keep running."`
  - retiring the exposure on a **phased** hunch → `200`, retired like any other tracker: losing it costs a count, not the result
  - the primary still returns its own existing `409` and message, unchanged
  - un-retiring (`retired: false`) is unaffected
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Implement.** Include `protocol: true` in the `db.parameter.findFirst`'s hunch relation (or read the protocol separately by `hunchId`), parse the design, and add the guard directly beneath the `isPrimary` one, with the same shape of comment.
- [ ] **Step 4: Run and watch pass.**
- [ ] **Step 5: Ready to commit** — `feat(parameters): keep the day-splitter running on an observational trial`

---

### Task 12: The export writes the arm that was compared

**Files:**
- Modify: `src/lib/export.ts`, `src/app/api/hunch/[id]/export/route.ts`
- Test: `src/lib/export.test.ts`

**Interfaces:**
- Consumes: `ProtocolShape` (Task 1)
- Produces: `ExportHunch` gains `shape: ProtocolShape` and `exposureId: string | null`.

- [ ] **Step 1: Write the failing tests:**
  - **phased CSV** — unchanged: the `phase` column holds `c.phase`, and the header still reads `phase`
  - **observational CSV** — a day stored `phase: "B"` with exposure `0` writes `A`; exposure `1` writes `B`; a day with no exposure reading writes an **empty** cell
  - **observational CSV header** — the second column reads `arm`, not `phase`, because on this trial the schedule label is not what was compared
  - **observational text** — the day line reads `arm B`; a day with no exposure answer reads `no arm (not answered)`
  - a hunch with no `exposureId` and `shape: "observational"` (impossible in practice, defensive) falls back to the stored phase rather than blanking the column
- [ ] **Step 2: Run and watch fail.**
- [ ] **Step 3: Implement** a single local helper used by both formats:

```ts
/**
 * The arm this day was actually compared in.
 *
 * An export is the record of what was compared, and it outlives the app. A
 * column reading "B" for a day with no basketball on it would be wrong in a
 * file someone hands to a doctor.
 */
function armOf(h: ExportHunch, c: ExportCheckIn): string | null {
  if (h.shape !== "observational" || !h.exposureId) return c.phase;
  const hit = c.values.find((v) => v.parameterId === h.exposureId);
  if (hit === undefined) return null;
  return hit.value === 1 ? "B" : "A";
}
```
  Use it at the two sites the spec names (the CSV row build and the text day line), and switch the CSV header word on `shape`.
- [ ] **Step 4: Update the export route** to pass `shape` (from `parseStoredDesign` on the protocol, `"phased"` when there is none) and `exposureId`.
- [ ] **Step 5: Run and watch pass**, then download both formats by hand from a seeded observational hunch and read them.
- [ ] **Step 6: Ready to commit** — `feat(export): write the arm each day was compared in`

---

### Task 13: The confirm gate says which design this is

**Files:**
- Modify: `src/components/hunch/protocol-view.tsx`, `src/components/hunch/parameter-editor.tsx`, `src/hooks/use-design-protocol.ts`
- Test: manual, in the browser (this is presentation over already-tested logic)

**Interfaces:**
- Consumes: `HunchInfo["hypothesis"]["schedulable"]` (Task 5), the `schedulable` body field on `POST /protocol` (Task 10)

- [ ] **Step 1: Hold the choice in the view.** In `ProtocolView`, seed `const [schedulable, setSchedulable] = useState<boolean | null>(null)` and resolve `const isSchedulable = schedulable ?? info.data?.hypothesis.schedulable ?? true`, mirroring how `edited ?? seeded` already works for the parameter list.
- [ ] **Step 2: Render one editable line** directly beneath the "What you're testing" card, inside the confirm gate branch:
  - not schedulable: **"We'll watch the days you do it, rather than ask you to do it on a schedule."** with a `change` button
  - schedulable: **"We'll ask you to do it on a schedule — some days on, some days off."** with a `change` button
  - `change` on the schedulable line flips to observational and adds an exposure draft row with an empty label, focused, so the user names it
  - `change` on the observational line flips to schedulable and drops the exposure row (`isExposure` cleared, row removed)
  - the button is the existing ghost-button styling from `parameter-editor.tsx`, at `size="touch"` — no new visual vocabulary
- [ ] **Step 3: Render the exposure row** in `ParameterEditor`. It sits directly under the primary, above the trackers disclosure, labelled **"days we compare"** (not "exposure" — nothing in the interface uses that word). Its kind picker is hidden: it is always yes/no. It is removable only by flipping the shape line.
- [ ] **Step 4: Block the design button** with a reason rather than a dead control, matching the gate's existing behaviour: when `!isSchedulable` and the exposure row's label is empty, `canDesign` is false and a line reads **"Name the one yes/no we'll ask each day."**
- [ ] **Step 5: Send it.** `useDesignProtocol` posts `{ parameters, schedulable: isSchedulable }`.
- [ ] **Step 6: Verify in the browser** — flip the line both ways, check the drafted list each time, design once from each side, and confirm the stored protocol's `shape` matches what the line said.
- [ ] **Step 7:** `npm run lint`, `npm run typecheck`.
- [ ] **Step 8: Ready to commit** — `feat(gate): let the user correct how their trial is shaped`

---

### Task 14: A window renders as a window

**Files:**
- Create: `src/components/trial-start.tsx`, `src/components/observational-plan.tsx`
- Modify: `src/components/protocol-stepper.tsx`, `src/components/hunch/protocol-view.tsx`

**Interfaces:**
- Produces: `<TrialStart hunchId={...} />` — the start block lifted out of `ProtocolStepper` verbatim (`useStartTrial`, the `StartOn` choice, the button); `<ObservationalPlan hypothesis design />`

- [ ] **Step 1: Extract the start block.** Move it out of `protocol-stepper.tsx` into `trial-start.tsx` with **no behaviour change**, and render `<TrialStart>` where it used to sit (still revealed by the last phase). Verify by starting a phased trial and confirming the anchor date is what you picked.
- [ ] **Step 2: Build `ObservationalPlan`** — a single card, not a stepper: what to do (the phase `action`), how long (`design.phases[0].days` days), what to log (the outcome and the daily yes/no), the controls, and then `<TrialStart>`. Reuse the stepper's card classes so it reads as the same family.
- [ ] **Step 3: Branch in `ProtocolView`** on `protocol.design.shape === "observational"` → `ObservationalPlan`, else `ProtocolStepper`. **Do not teach the stepper a one-phase case** — the view branches, per the spec. A diary (`shape: "diary"`) keeps whatever it renders today; this branch must not capture it.
- [ ] **Step 4: Verify in the browser** for all three: a phased trial still steps A→B→A, an observational one shows one card with no timeline and no "phase 1 of 3", a diary is unchanged.
- [ ] **Step 5:** `npm run lint`, `npm run typecheck`.
- [ ] **Step 6: Ready to commit** — `feat(protocol): render an observation window as one card`

---

### Task 15: Say it while it's running

**Files:**
- Modify: `src/components/hunch/hunch-dashboard.tsx`, `src/components/adherence-strip.tsx`

**Interfaces:**
- Consumes: `BeliefResponse["exposure"]` (Task 9), `Parameter["isExposure"]` (Task 6), `exposureSummary` (Task 8)

- [ ] **Step 1: The count on the dashboard.** When `query.data.exposure` is non-null and the trial is running, render `exposureSummary(exposure)` beneath the belief meter, in the muted line style already used for the diary note. A user whose exposure arm is starving finds out on day 9, not at the end.
- [ ] **Step 2: Mark the exposed days on the strip.** `AdherenceStrip` already receives `checkIns` (with values) and `parameters`. Find the exposure parameter, and for a day whose exposure reading is `1`, draw the accent underline the strip already uses for intervention days: `shadow-[inset_0_-3px_0_0_var(--s2)]`. On an observational trial `d.kind` is always `baseline`, so this is the only thing that distinguishes the days — the tile condition becomes "intervention **or** exposed".
- [ ] **Step 3: Keep the screen-reader label honest** — an exposed day's `aria-label` gains the exposure label, e.g. `Day 9, 14 Sep — logged, played basketball`.
- [ ] **Step 4: Verify in the browser** on a seeded observational trial with a mix of exposed, unexposed and unanswered days; correct a day through the strip and watch both the mark and the count move.
- [ ] **Step 5:** `npm run lint`, `npm run typecheck`.
- [ ] **Step 6: Ready to commit** — `feat(dashboard): show how many days the change actually happened`

---

### Task 16: The verdict says what it compared

**Files:**
- Modify: `src/components/verdict.tsx`

**Interfaces:**
- Consumes: `Verdict["exposure"]` (Task 9), `verdictHeadline`, `exposureSummary`, `exposureDropped`, `observationalCaveat` (Task 8)

- [ ] **Step 1: Pass the report into the headline** — `verdictHeadline(v.category, v.outcome ?? null, v.exposure ?? null)`, so an observational thin-arm result reads `Too few days either side of "Played basketball"` instead of the false "Not enough days to tell". The **badge is unchanged**: home still says "Not enough days".
- [ ] **Step 2: Under the headline**, when `v.exposure` is set, render `exposureSummary(...)`, and beneath it `exposureDropped(...)` when it returns a line. Both in the same muted body style as the narrative — this is part of the result, not a footnote.
- [ ] **Step 3: The caveat, once.** When `v.exposure?.observational`, render `observationalCaveat(v.exposure)` as the last line of the card, before the actions. Never on a phased trial, and never twice.
- [ ] **Step 4: Verify in the browser** on three concluded trials: phased with no exposure (nothing new renders), phased with an exposure (counts over the phase-B days, no caveat), observational (counts, dropped line, caveat).
- [ ] **Step 5:** `npm run lint`, `npm run typecheck`, `npm test`.
- [ ] **Step 6: Ready to commit** — `feat(verdict): name what the comparison was between`

---

## Done when

- A hunch the Coach marks non-schedulable gets one 21-day window, an exposure question in the daily check-in, and arms derived from that question — verified end to end in the browser, not only in tests.
- A day logged as "didn't play" sits in the A arm no matter what `CheckIn.phase` says, and correcting it moves the day.
- Every scheduled trial in the app behaves exactly as it does today: same phases, same arms, same verdicts. The phased-passthrough test in Task 7 is what proves it.
- A trial carrying an exposure — either shape — says how many days it happened on, while running and on the verdict.
- An observational verdict carries the correlational line once, and never claims cause.
- The export's arm column is what was actually compared.
- The exposure cannot be retired out from under an observational trial.
- `npm test`, `npm run typecheck` and `npm run lint` are green; `npm run test:eval -- hypothesis-coach` passes both new cases with a key present.

## Out of scope (from the spec §10)

Dose or duration as exposure; reshaping a running trial; adjusting for the self-selection bias; tracker padding; agent disagreement on scale ranges.
