# Sharpen → Protocol rework — design

**Date:** 2026-07-20
**Status:** approved (pending spec review)

## Problem

User feedback after running the flow end-to-end:

1. The coach doesn't catch the hunch properly and asks no questions — it one-shots
   a hypothesis from vague text, so the result is often wrong.
2. The sharpen result stage dumps too much info at once.
3. The protocol page is a redundant "click to design" step.
4. Designed protocols look generic/samey — a coffee→sleep hunch and a
   desk→focus hunch produce near-identical-looking plans.
5. Content overflows on the sharpen and protocol screens.
6. Theme/smoothness inconsistent with the rest of the app on those screens.

## Approved decisions

- **Sharpen flow:** short Q&A first. Coach asks ≤3 clarifying questions, then commits ONE hypothesis.
- **Questions:** AI-generated per hunch, answered by tapping chips with a free-text "other" fallback.
- **Protocol step:** Approach 2 — sharpen and protocol stay separate pages; the protocol page auto-designs on arrival (no button).
- **Tailored plans:** phases carry human names + concrete actions so plans visibly reflect the specific hunch.
- **Architecture:** two agents — a `clarifier` and the existing `hypothesis-coach` — not one agent with two modes.

## The reworked flow

```
/hunch/new
  raw hunch → "Sharpen it"
    → clarifier returns ≤3 tappable questions (hunch-specific)
    → user taps chips / types own → "Lock it in"
    → hypothesis-coach commits ONE hypothesis (fed the answers)
    → lean confirm: statement + "measured by {metric}" only
    → [Continue →]
/hunch/[id]/protocol   (auto-designs on mount, no button)
    → tailored plan: named phases, hunch-specific steps, controls
    → [Start experiment →]
/hunch/[id]            (live dashboard — already branded)
```

## Section 1 — Conversational coach (two agents)

### New agent: `clarifier` (`src/mastra/agents/clarifier.ts`)
- Input: `rawText` (+ optional priors).
- Output (structured): `clarifyingQuestionsSchema`.
- Returns at most 3 questions tailored to the hunch. Each question offers 2-4
  tappable options and permits a free-text answer.
- Prompt goal: ask only what materially sharpens the hypothesis — the outcome,
  how it's measured, and the exact intervention/dose. No filler questions.

### New schema (`src/lib/schemas/clarify.ts`)
```ts
clarifyingQuestionSchema = z.object({
  id: z.string().min(1),            // stable key, e.g. "outcome"
  prompt: z.string().min(1),        // the question text
  options: z.array(z.string().min(1)).min(2).max(4),
  allowOther: z.boolean(),          // free-text fallback allowed
});
clarifyingQuestionsSchema = z.object({
  questions: z.array(clarifyingQuestionSchema).min(1).max(3),
});
clarifyingAnswerSchema = z.object({
  id: z.string().min(1),            // matches question id
  answer: z.string().min(1),        // chip value OR typed text
});
```

### `hypothesis-coach` change
- `sharpenHunch(rawText, priors, answers)` — new `answers: ClarifyingAnswer[]` arg.
- Answers are folded into the prompt as resolved context so the coach commits an
  accurate hypothesis instead of guessing.

### API routes
- **New:** `POST /api/hunch/clarify` — body `{ rawText }` → `{ questions }`.
  Pre-hunch: no hunch row exists yet, so this route creates nothing.
- **Changed:** `POST /api/hunch` — body gains `answers: ClarifyingAnswer[]`
  (optional; empty array tolerated so the route never hard-fails on missing Q&A).

## Section 2 — Lean sharpen page (`new-hunch-form.tsx`)

State machine: `idle → asking → answering → committing → done`.

- `idle`: textarea + "Sharpen it" (unchanged look).
- `asking`: brief loader while the clarifier runs.
- `answering`: render the ≤3 questions as brand chip groups; each has an "other"
  input. "Lock it in" enabled once every question has an answer (or is skipped —
  see error handling). Transitions use the existing `opacity 300ms` pattern.
- `committing`: loader while the coach commits.
- `done`: show ONLY the statement (Clash Display) + one line "measured by
  {metric}". No confounder dump, no priors wall — those move to the protocol
  page. `[Continue →]` links to `/hunch/[id]/protocol`.

## Section 3 — Tailored protocol

### Schema change (`src/lib/schemas/protocol.ts`)
```ts
protocolPhaseSchema = z.object({
  label: z.enum(["A", "B"]),
  kind: z.enum(["baseline", "intervention"]),
  days: z.number().int().positive(),
  name: z.string().trim().min(1),   // NEW — e.g. "Normal coffee"
  action: z.string().trim().min(1), // NEW — what you do this phase
});
```

### Protocol designer
- Prompt updated to emit `name` + `action` per phase, in the user's own terms.
- `composeInstructions` fallback (already added this session) extended to
  synthesize `name`/`action` deterministically if the model omits them, so the
  schema's non-empty invariant still can't 500 the page.

### `protocol-track.tsx`
- Phase boxes show the phase `name` prominently (not just the A/B/A letter);
  the letter becomes a small tag. `action` shown under each phase.
- Result: two different hunches produce visibly different plans.

### `protocol/page.tsx`
- Auto-runs `design.mutate()` once on mount (guard against double-fire under
  React strict/dev remount). Remove the manual "Design my protocol" button as
  the entry action; keep a "Redesign" affordance for retries.

## Section 4 — Overflow, theme, smoothness (cross-cutting)

- **Overflow:** cards get `minWidth: 0` and `overflowWrap: anywhere`; the phase
  track becomes `overflow-x: auto` on narrow widths instead of bursting the
  container; long instruction/control text wraps rather than clips. Audit
  sharpen, protocol, and dashboard.
- **Theme:** all three screens already migrated to the brand system
  (`appThemeStyle`, Clash Display / Space Mono, `--ink/--paper/--rule/--s1/--s2`)
  earlier this session; verify no stray Tailwind utility leaks remain.
- **Smoothness:** reuse `new-hunch-form`'s `transition: opacity 300ms` between
  states so the Q&A feels continuous, matching the existing add-hunch feel.

## Error handling

- Clarifier fails → skip Q&A, fall straight to a one-shot sharpen (degrade, don't
  block). Surface a soft brand error only if the sharpen itself also fails.
- Sharpen accepts an empty `answers` array (clarifier-skipped path).
- Protocol design already retries/falls back for `instructions`; extend the same
  guard to `name`/`action`.
- Auto-design on mount must be idempotent (ref guard) so a dev remount or a
  duplicate render doesn't fire two POSTs.

## Testing

- `clarifier` eval: given a vague hunch, returns ≤3 on-topic questions with
  valid options (schema-valid, count bounded).
- `sharpen` unit: answers are threaded into the prompt; empty answers tolerated.
- `composeInstructions` unit (exists) extended to cover `name`/`action` fallback.
- `protocol-track` renders phase `name`/`action` without overflow (basic render).
- API route tests for `/api/hunch/clarify` (happy path + clarifier failure →
  graceful) and `/api/hunch` with/without answers.

## Out of scope (YAGNI)

- No multiple protocol *design* options to pick from (user chose "tailored", not "choice of designs").
- No verdict-screen rework (complaint was about the protocol, not the verdict).
- No confounder statistical adjustment (already deferred to Phase 4).
- No `npm run dev` Docker autostart work (separate parked thread).
