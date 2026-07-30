# Multi-Parameter Logging — Design

**Date:** 2026-07-30
**Branch:** rework/sharpen-protocol (or a fresh feature branch)
**Status:** Approved (design), pending implementation plan

## Problem

The flow the user expects (per their diagram) has an explicit step where the
user **adds/confirms the parameters** the experiment will track *before* the
A/B/A protocol is derived, and then **logs all those parameters daily**. The
current app:

- Sharpens a hunch into a **single** outcome metric, chosen by the LLM, never
  confirmed or editable by the user.
- Logs a **single** `CheckIn.value` per day.
- Has no "propose parameters → user edits/adds → confirm → derive experiment"
  step, and no fallback when parameters can't be auto-derived.

## Goal

Let the user define/confirm a set of **parameters** to log daily. One is the
**primary outcome** (drives the Bayesian verdict); the rest are **secondary
trackers** logged as context. The LLM proposes an initial set from the hunch;
the user edits, adds, removes, and confirms on the protocol confirm gate before
the ABA is designed.

Non-goals (YAGNI): per-parameter verdicts, correlation analysis across
parameters, more than ~4 proposed trackers, editing parameters after the trial
starts.

## Decisions (resolved during brainstorming)

1. **Multiple daily parameters** — not just the single outcome.
2. **One primary + trackers** — the primary parameter drives the existing
   single-outcome Bayesian verdict (A vs B). Secondary trackers are logged and
   displayed but never verdicted. Avoids multiple-comparisons confusion.
3. **Relational model** (not a JSON blob) — clean per-parameter queries + integrity.

## Data Model

Prisma (custom client output `src/generated/prisma`, exported as `db`).

New model **`Parameter`** (one row per tracked thing per hunch):

```
model Parameter {
  id         String   @id @default(cuid())
  hunchId    String
  label      String                 // human label, e.g. "hours of sleep"
  type       String                 // "binary" | "continuous"
  unit       String?                // optional display unit, e.g. "hrs", "1-10"
  min        Float?                 // optional bound (continuous scales)
  max        Float?
  isPrimary  Boolean  @default(false)
  sortOrder  Int      @default(0)
  hunch      Hunch        @relation(fields: [hunchId], references: [id], onDelete: Cascade)
  values     CheckInValue[]
  @@index([hunchId])
}
```

- Exactly **one** `isPrimary = true` per hunch (enforced in app logic + a
  transaction; no partial-unique-index reliance required for v1).

`CheckIn` keeps being the **per-day bucket** (phase + date), but its scalar
`value` moves into a child:

```
model CheckInValue {
  id          String   @id @default(cuid())
  checkInId   String
  parameterId String
  value       Float                  // 1/0 for binary, measure for continuous
  checkIn     CheckIn   @relation(fields: [checkInId], references: [id], onDelete: Cascade)
  parameter   Parameter @relation(fields: [parameterId], references: [id], onDelete: Cascade)
  @@unique([checkInId, parameterId])
  @@index([parameterId])
}
```

`CheckIn.value` (Float) is **removed** after backfill.

### Migration + backfill

1. Create `Parameter` and `CheckInValue`.
2. For each `Hypothesis`: insert one `Parameter` — `label = outcomeMetric`,
   `type = outcomeType`, `isPrimary = true`, `sortOrder = 0`.
3. For each existing `CheckIn`: insert a `CheckInValue` referencing that hunch's
   primary `Parameter`, `value = CheckIn.value`.
4. Drop `CheckIn.value`.
5. Post-migration: `prisma generate` → clear `.next` → restart dev (custom
   client output path + Turbopack cache).

Existing hunches keep working — they simply have a single primary parameter.

## LLM / Sharpen changes

`hypothesis-coach` (`src/mastra/agents/hypothesis-coach.ts`):

- Extend `sharpenedHypothesisSchema` with `trackers`:
  ```
  trackers: z.array(z.object({
    label: z.string().trim().min(1),
    type: z.enum(["binary", "continuous"]),
    unit: z.string().trim().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })).max(4).default([])
  ```
- Instruction update: after the primary outcome, propose **0–4 trackers** — the
  loggable symptoms/co-variables a person could record daily that help interpret
  the result (e.g. caffeine intake, stress 1–10, exercise). For scale trackers,
  set `min`/`max`. These are the diagram's "alternative parameters or symptoms."
- `buildSharpenPrompt` unchanged in inputs; the schema change carries the new
  output. The primary outcome is still `statement` / `outcomeMetric` /
  `outcomeType` (unchanged; the plain-wording rule from the prior change stays).

## Flow / UX

1. `/hunch/new` → clarify questions → answers. **Unchanged.**
2. Sharpen returns the primary outcome **+ proposed trackers**. The form seeds
   the protocol page's query cache (as today) with the hypothesis; trackers ride
   along.
3. **Protocol confirm gate becomes two parts on the one page** (Variation B kept):
   - **a. Hypothesis card** — confirm the sentence (as today).
   - **b. Parameters** — the **primary** parameter (prefilled from the outcome;
     label + type + unit editable) plus proposed trackers. Under a
     **"＋ things to track"** affordance so the default view stays focused. Per
     row: edit label, toggle **number ↔ yes/no**, optional unit + min/max
     (for scales), remove, reorder. Add a blank tracker.
   - **"Looks right — design it →"** gates on **≥1 valid primary** (label + type).
4. **Fallback branch** (diagram bottom path): if the LLM proposes no usable
   trackers, the section shows an empty prompt ("Add what you'll measure"). If
   the user adds none either, they proceed with **just the primary** — design
   never fires without it; no dead-end.
5. Design ABA → stepper → start. **Unchanged downstream.**
6. **Logging** (`CheckInTap`) shows **all** parameters, each with its own input
   (bounded number / free number / Yes-No), the primary emphasized on top. One
   submit writes all values for the day. Partial logging allowed. Each input is
   labeled by its parameter (fixes the "mystery number" + "unbounded scale"
   issues).

## API changes

- `POST /api/hunch` (sharpen) → response includes `trackers`.
- `POST /api/hunch/[id]/protocol` (design) → request body includes the
  **confirmed parameter list**; the route creates `Parameter` rows (exactly one
  primary) in the **same transaction** as the protocol, then designs the ABA.
  One round-trip from confirm → design.
- `GET /api/hunch/[id]` → returns `parameters` (hydrates the confirm gate and
  the logging screen).
- `POST /api/hunch/[id]/checkin` → body becomes
  `{ values: [{ parameterId, value }] }` (was `{ value }`). Phase still derived
  server-side; upserts the `CheckIn` bucket + one `CheckInValue` per parameter.
  Validates each value against its parameter's type/min/max.

## Verdict / Bayes

- `computeBelief` **unchanged**. Reads only the **primary** parameter's
  `CheckInValue`s, grouped by phase (A vs B).
- `verdict` route, `belief` route, `home.ts` progress → read primary parameter
  values instead of `CheckIn.value`.
- Secondary trackers never enter the statistical engine.

## Error handling

- Design refuses without a valid primary parameter (client gates; server
  re-validates and 400s).
- Check-in validates each value: binary ∈ {0,1}; continuous finite and within
  `[min,max]` when bounded. Rejects with 400 on bad values; partial payloads OK.
- Unknown `parameterId` for the hunch → 400.
- Existing washout/pre-start/post-end and single-row-per-day guards unchanged.

## Testing

- `Parameter` / `trackers` zod schema validation (bounds, type enum, max 4).
- Migration backfill logic (primary parameter created; values mapped).
- Check-in multi-value upsert (create + overwrite same day; partial payload).
- `computeBelief` still computes correctly on the primary parameter only.
- `buildSharpenPrompt` / coach output includes trackers (schema round-trip).
- Adapt existing tests referencing `CheckIn.value` / `outcomeType`-derived input.
- Keep the full unit suite green.

## Rollout notes

- Single migration; dev DB is disposable, real account has a handful of rows —
  backfill covers them.
- Feature is additive to the confirm gate; the stepper/verdict UI is largely
  unchanged.
