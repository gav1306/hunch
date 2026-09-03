# Mid-Trial Safety Net — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Notice, while a trial is running, when a logged number is a typo, unusual for this person, or past a published limit — and say so once, to them, without ever letting it touch the result.

**Architecture:** Three pure functions over the reading and the user's own history. The check-in response carries flags; nothing is stored, so nothing can leak into the engine. **No model call anywhere in this path.**

**Spec:** `docs/superpowers/specs/2026-09-02-parameters-and-safety-design.md` §4.

## Global Constraints

- **No LLM, ever, in this path.** An LLM deciding whether someone should see a doctor is the exact thing this app must not do. Every threshold is arithmetic or a published number.
- **A flag is never stored.** It is computed on write and returned in the response. It cannot enter `belief`, a `Verdict`, or a `CausalEdge`, because there is nowhere for it to persist.
- **A flag never blocks the reading.** The day is logged first. This notices; it does not refuse.
- **No diagnosis and no treatment advice.** A limit flag names the published number, cites where it comes from, and stops. The outlier flag speaks only about the user's own data.
- **Nothing is automatic.** The banner offers; the user decides.
- **No commit trailers.**

## The deviation worth stating

**The banner offers "finish this trial early", not "pause".** The spec says pause. A real pause means freezing a clock anchored on `protocol.startedAt` — storing paused intervals and changing every date computation in `src/lib/schedule.ts`, the adherence strip and the reminder sweep. That is its own feature with its own risk, and shipping a fake pause would be worse than offering the exit that already works honestly. Abandoning keeps every logged day.

---

### Task 1: The three checks

**Files:** create `src/lib/safety/reading-flags.ts`, `src/lib/safety/reading-flags.test.ts`

**Produces:** `flagReading({ parameter, value, history }): ReadingFlag | null`, where `ReadingFlag = { kind: "typo" | "outlier" | "limit"; message: string; suggestion?: number; source?: string }`.

- [ ] **Step 1: Failing tests** — cover, in this order of precedence:

**Typo.** A value an order of magnitude outside the parameter's own bounds, where dropping a digit lands inside them. `{ min: 60, max: 200 }`, value `1200` → suggests `120`. Value `250` → no typo flag (a plausible mistake, not a slipped digit).

**Published limit.** Only for `amount` parameters whose label or unit identifies blood pressure (mmHg) or blood glucose (mg/dL, mmol/L):
- systolic ≥ 180 or ≤ 90
- diastolic ≥ 120
- glucose ≥ 300 mg/dL or ≤ 70 mg/dL

Each carries a `source` naming the guidance. Nothing else gets a limit flag — a bug count of 9000 is not a medical event.

**Personal outlier.** More than 3 standard deviations from the mean of this user's own readings for this parameter, with **at least 7 prior readings** — below that the distribution is not a distribution. Says only "this is unusual for you", which is the only claim the data supports.

**Precedence:** typo, then limit, then outlier. A slipped digit that lands past a published limit is a typo, and telling someone to see a doctor about a keystroke would be both wrong and alarming.

- [ ] **Step 2** Run, watch fail. **Step 3** Implement. **Step 4** Run, watch pass.
- [ ] **Step 5** Mutation-check: drop the 7-reading floor and confirm a 2-reading history no longer flags; swap typo/limit precedence and confirm the slipped-digit case changes.
- [ ] **Step 6** Commit.

---

### Task 2: Carry it back on the check-in

**Files:** `src/app/api/hunch/[id]/checkin/route.ts`, its test

- [ ] After the values are written, load this hunch's prior readings per flagged parameter, run `flagReading`, and return `{ checkIn, belief, flags }`.
- [ ] Tests: a flag appears in the response; **the reading is still written when flagged**; `flags` is `[]` normally.
- [ ] The route must not persist a flag anywhere. A test asserts no write beyond the check-in and its values.
- [ ] Commit.

---

### Task 3: Say it once, and offer the exit

**Files:** `src/hooks/use-checkin.ts`, `src/components/check-in.tsx`

- [ ] The mutation response carries `flags`; the check-in renders them beneath the form after a successful log.
- [ ] **Typo** — "Did you mean 120? You logged 1200." with `Change it` (refocuses the field, pre-filled with the suggestion) and `No, that's right`.
- [ ] **Outlier** — "That's unusual for you — your other readings sit around 118." Dismissible. No advice.
- [ ] **Limit** — the published number, its source, and two doors: `Finish this trial early` (the existing abandon path) and `Keep going`.
- [ ] Copy must not diagnose, must not tell them what to do about it, and must not repeat itself on every subsequent day.
- [ ] Verify in the browser with a seeded parameter and a deliberately extreme reading.
- [ ] Commit.

---

## Done when

- A slipped digit is caught and offered a correction.
- A reading past a published limit names the number and its source, and offers a way out.
- An unusual-for-you reading says only that.
- No flag is stored, and none reaches a verdict.
- `npm test` green; `grep` confirms no agent import in this path.
