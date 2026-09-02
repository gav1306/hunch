# Observe-Only and the Medication Door — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a refused hunch somewhere to go. A trial the app won't schedule becomes a diary it will keep — and a hunch that proposes changing prescribed medication is turned away early, in words that name the reason once and leave a working door open.

**Architecture:** Observe-only is a fourth `safetyState` carrying a one-phase design, so every existing piece — the schedule, the adherence strip, the check-in — works unchanged. It produces no verdict, because there is no contrast to compute one from. The medication check is pure string work that runs before any model call.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7 (custom client at `src/generated/prisma`), PostgreSQL, Zod 4, Vitest 4, shadcn on Base UI, Mastra on Claude Sonnet 5 via OpenRouter.

**Spec:** `docs/superpowers/specs/2026-09-02-parameters-and-safety-design.md` §3.

## Global Constraints

- **The app never schedules a change to prescribed medication.** No phase ever says "today, skip it". If a doctor changes a dose mid-trial, logging what follows is fine — the app is simply not the thing that decided it.
- **The medication check is pure code.** No model call, no network. It runs before the Coach, so a refusal costs nothing and arrives before the user has invested in a plan.
- **It is a guardrail, not a lock.** It catches phrasing, not intent; someone determined can word around it. The Safety Reviewer is the second layer. Neither the code comments nor the PR may describe layer one as if it were airtight.
- **Observe-only produces no verdict.** One phase means no A/B contrast, and computing a verdict from a single arm would be inventing a comparison the data cannot support.
- **No diagnosis, no advice, no personalisation on a condition.** Observe-only is a diary. It records; it does not interpret.
- **No commit trailers.** Never add `Co-Authored-By` or `Generated with`.
- **Prisma is custom-output.** After schema changes: `npx prisma generate`, delete `.next`, restart dev.
- **Vitest collects `src/**/*.test.ts` only.**

## Two decisions worth arguing about

**1. The observe-only phase is labelled `A`, kind `baseline`.** It could have had a label of its own — `O`, say — but every consumer (`currentPhase`, the adherence strip, the check-in's phase text, `CheckIn.phase`) already understands A and B. A new label means touching all of them to teach each one a third case, for a distinction the user never sees. The design's `phases.length === 1` is what marks it, and that is what the code tests.

**2. An observe-only run is 14 days, not open-ended.** A diary has no natural end, but every screen in this app assumes one: the adherence strip draws a fixed row, home sorts by days remaining, and "done" is what moves a hunch out of the way. Fourteen days is two weeks of habit and enough rows to see a pattern in. Ending is not deleting — the log stays, and a repeat is one tap.

---

### Task 1: The medication check

**Files:**
- Create: `src/lib/safety/medication.ts`
- Create: `src/lib/safety/medication.test.ts`

**Interfaces:**
- Produces: `medicationIntent(rawText: string): boolean` — true when the text reads as a proposal to vary prescribed medication.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/safety/medication.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { medicationIntent } from "@/lib/safety/medication";

describe("medicationIntent", () => {
  test.each([
    "I want to see if I feel better when I stop taking my statin",
    "Do I sleep better if I skip my antidepressant?",
    "off my meds for a week to see what happens",
    "how I feel without my blood pressure pills",
    "trying a half dose of my thyroid medication",
    "taking my metformin every other day instead",
    "cutting my dose of sertraline in half",
  ])("catches %s", (text) => {
    expect(medicationIntent(text)).toBe(true);
  });

  test.each([
    "coffee after lunch wrecks my sleep",
    "I get more headaches on days I stare at screens late",
    "my houseplants droop when I play music",
    // Taking something as prescribed is not a variation, and must not be
    // caught: this is exactly the hunch observe-only exists to keep.
    "I want to track how I feel while I take my statin",
    "does my magnesium supplement help me sleep",
    // "skip" alone is ordinary English about non-medication things.
    "I skip breakfast on busy days",
    "skipping my morning walk makes my code buggier",
  ])("lets %s through", (text) => {
    expect(medicationIntent(text)).toBe(false);
  });

  test("is case and punctuation insensitive", () => {
    expect(medicationIntent("STOP TAKING MY PILLS.")).toBe(true);
    expect(medicationIntent("stop  taking   my  pills")).toBe(true);
  });

  test("says nothing about empty input", () => {
    expect(medicationIntent("")).toBe(false);
    expect(medicationIntent("   ")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/safety/medication.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement it**

Create `src/lib/safety/medication.ts`:

```ts
/**
 * Does this hunch read as a proposal to vary prescribed medication?
 *
 * Pure string work, deliberately: it runs before the Coach, so a refusal costs
 * nothing and arrives before the user has spent three minutes on a plan. The
 * Safety Reviewer is the second layer, and catches what phrasing hides.
 *
 * This is a guardrail, not a lock. It matches phrasing, not intent, and someone
 * determined can word around it. Do not treat a false here as proof of safety.
 *
 * The shape it looks for is a VARIATION verb near a MEDICINE noun. Neither half
 * is enough on its own: "I skip breakfast" is not medical, and "I take my
 * statin" is someone following their prescription — which is exactly the hunch
 * observe-only exists to keep.
 */
const VARIATION = [
  "stop taking",
  "stopping",
  "quit taking",
  "come off",
  "coming off",
  "go off",
  "going off",
  "off my",
  "skip my",
  "skipping my",
  "without my",
  "half dose",
  "halve",
  "cutting my dose",
  "cut my dose",
  "lower my dose",
  "reduce my dose",
  "double my dose",
  "every other day",
];

const MEDICINE = [
  "med",
  "meds",
  "medication",
  "medicine",
  "pill",
  "pills",
  "tablet",
  "tablets",
  "dose",
  "prescription",
  "prescribed",
  "antidepressant",
  "statin",
  "metformin",
  "insulin",
  "sertraline",
  "thyroid",
  "blood pressure pill",
  "bp med",
];

/** Lower-case, collapse whitespace, drop punctuation that splits phrases. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function medicationIntent(rawText: string): boolean {
  const text = normalise(rawText);
  if (!text) return false;

  const varies = VARIATION.some((p) => text.includes(normalise(p)));
  if (!varies) return false;

  // Word-boundary matching, so "medical" doesn't count as "med" and
  // "doses" does count as "dose".
  return MEDICINE.some((m) => new RegExp(`\\b${normalise(m)}s?\\b`).test(text));
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/lib/safety/medication.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove they bite**

Drop the `MEDICINE` requirement (return `varies`), re-run, and confirm the "I skip breakfast" and "skipping my morning walk" cases fail. Put it back — that pair is the whole reason the check needs both halves.

- [ ] **Step 6: Commit**

```bash
git add src/lib/safety
git commit -m "feat(safety): catch a hunch that proposes varying prescribed medication"
```

---

### Task 2: Turn it away at the door

**Files:**
- Modify: `src/app/api/hunch/route.ts` (creation)
- Modify: `src/app/api/hunch/[id]/sharpen/route.ts` (re-sharpen)
- Modify: `src/lib/schemas/clarify.ts` or wherever the sharpen response type lives — add the blocked shape
- Test: `src/app/api/hunch/route.test.ts`

**Interfaces:**
- Consumes: `medicationIntent` (Task 1).
- Produces: both routes answer `422 { blocked: "medication", error: <copy> }` before any model call.

422 rather than 400: the request is well formed and the app understood it perfectly. It is refusing, not failing to parse.

- [ ] **Step 1: Write the failing test**

Append to `src/app/api/hunch/route.test.ts`:

```ts
it("refuses a medication-variation hunch before calling the model", async () => {
  const res = await POST(req({ rawText: "do I sleep better if I skip my antidepressant" }));

  expect(res.status).toBe(422);
  const body = await res.json();
  expect(body.blocked).toBe("medication");
  expect(body.error).toContain("can't plan a trial that changes your medication");
  // The whole point of a deterministic check: it costs nothing.
  expect(sharpenHunch).not.toHaveBeenCalled();
  expect(db.hunch.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app/api/hunch/route.test.ts`
Expected: FAIL with 201 — the hunch is created and the Coach is called.

- [ ] **Step 3: Add the refusal**

In both routes, directly after the input schema parses and **before** any model call or write:

```ts
  // Deterministic, and first: a refusal here costs no tokens and arrives before
  // the user has invested anything in a plan. The Safety Reviewer is the second
  // layer, for the phrasings this list will miss.
  if (medicationIntent(parsed.data.rawText)) {
    return NextResponse.json(
      { blocked: "medication", error: MEDICATION_REFUSAL },
      { status: 422 },
    );
  }
```

Add to `src/lib/safety/medication.ts`:

```ts
/**
 * What the user reads. It names the reason once and does not repeat it: no
 * warning triangle, no paragraph on safety. The person asking this has usually
 * noticed something real and wants to know if it is real, and the message must
 * not read as an accusation.
 */
export const MEDICATION_REFUSAL =
  "Hunch can't plan a trial that changes your medication. Starting, stopping or " +
  "adjusting a prescribed drug is a decision for you and your doctor. What it can " +
  "do is keep the record: log how you feel each day while you take it exactly as " +
  "prescribed, and if your doctor does change something, the log is already running.";
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: green and clean.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/hunch" src/lib/safety
git commit -m "feat(safety): refuse a medication-variation hunch before the model call"
```

---

### Task 3: Observe-only, the destination

**Files:**
- Modify: `prisma/schema.prisma` (the `safetyState` comment only — the column is already `String`)
- Modify: `src/lib/schemas/protocol.ts` (`observe-only` in the persisted states, `observeOnlyDesign`)
- Create: `src/app/api/hunch/[id]/observe/route.ts`
- Create: `src/app/api/hunch/[id]/observe/route.test.ts`
- Test: `src/lib/schemas/protocol.test.ts`

**Interfaces:**
- Produces: `observeOnlyDesign(outcomeMetric: string): ProtocolDesign`; `OBSERVE_DAYS = 14`; `POST /api/hunch/[id]/observe` → `201 { protocol }`.

- [ ] **Step 1: Write the failing design test**

Append to `src/lib/schemas/protocol.test.ts`:

```ts
describe("observeOnlyDesign", () => {
  const design = observeOnlyDesign("hours of sleep");

  test("has exactly one phase — there is nothing to contrast", () => {
    expect(design.phases).toHaveLength(1);
  });

  test("reuses the baseline label so the schedule needs no new case", () => {
    expect(design.phases[0]).toMatchObject({ label: "A", kind: "baseline", days: OBSERVE_DAYS });
  });

  test("asks the user to change nothing", () => {
    expect(design.phases[0].action.toLowerCase()).toContain("change nothing");
  });

  test("has no washout — a washout separates arms, and there is one arm", () => {
    expect(design.washoutDays).toBe(0);
  });

  test("passes the stored-design parser the dashboard reads through", () => {
    expect(() => parseStoredDesign(design, "hours of sleep")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/schemas/protocol.test.ts`
Expected: FAIL — `observeOnlyDesign is not defined`.

- [ ] **Step 3: Build the design**

In `src/lib/schemas/protocol.ts`:

```ts
/**
 * How long a diary runs. A diary has no natural end, but every screen here
 * assumes one — the adherence strip draws a fixed row, home sorts by days left,
 * and "done" is what stops a hunch competing for attention. Two weeks is enough
 * habit to hold and enough rows to see a pattern in. Ending is not deleting.
 */
export const OBSERVE_DAYS = 14;

/**
 * The protocol for a hunch the app will record but not schedule.
 *
 * One phase, labelled `A`/`baseline` on purpose: `currentPhase`, the adherence
 * strip, the check-in's phase text and `CheckIn.phase` all already understand A
 * and B, and a third label would mean teaching each of them a case the user
 * never sees. `phases.length === 1` is what marks a diary, and it is what the
 * code checks.
 */
export function observeOnlyDesign(outcomeMetric: string): ProtocolDesign {
  return {
    phases: [
      {
        label: "A",
        kind: "baseline",
        days: OBSERVE_DAYS,
        name: "Just keep the record",
        action: `Change nothing about your routine. Each day, log ${outcomeMetric}.`,
      },
    ],
    washoutDays: 0,
    controls: [],
    instructions:
      "This one is a log, not a trial: nothing changes, you just write down what happens. " +
      "At the end you'll have your own record of it, and it's yours to export.",
  };
}
```

Add `"observe-only"` wherever the persisted `safetyState` values are enumerated. **Leave `safetyVerdictSchema.state` as `approved | refused`** — that is the reviewer's vocabulary, and the reviewer never produces this.

- [ ] **Step 4: Write the failing route tests**

Create `src/app/api/hunch/[id]/observe/route.test.ts`, covering:

- 201 and a protocol with `safetyState: "observe-only"` and a one-phase design.
- Parameters are untouched — the set the user confirmed is what gets logged.
- 409 when the hunch has no hypothesis yet (there is nothing to log).
- 409 when a protocol already exists with `startedAt` — a running trial is not converted underneath itself.
- 404 for a hunch that isn't theirs; 401 without a session.
- **No model call**: the design workflow is never imported or invoked.

Follow the mocking idiom of `src/app/api/hunch/[id]/parameters/route.test.ts`.

- [ ] **Step 5: Write the route**

Create `src/app/api/hunch/[id]/observe/route.ts`. It upserts a `Protocol` with `safetyState: "observe-only"`, `design: observeOnlyDesign(hypothesis.outcomeMetric)`, `powerInfo: null`, and no `startedAt` — starting stays the user's separate act, exactly as it is for a designed trial.

**It calls no agent.** There is nothing to design and nothing to review: the protocol says change nothing.

- [ ] **Step 6: Run and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add src/lib/schemas/protocol.ts "src/app/api/hunch/[id]/observe" src/lib/schemas/protocol.test.ts prisma
git commit -m "feat(protocol): observe-only, a hunch the app records but won't schedule"
```

---

### Task 4: Let a diary run

**Files:**
- Modify: `src/app/api/hunch/[id]/start/route.ts:54` (the approved-only gate)
- Modify: `src/app/api/hunch/[id]/checkin/route.ts` (same gate)
- Modify: `src/app/api/hunch/[id]/verdict/route.ts` (refuse to compute one)
- Modify: `src/lib/home.ts:110,128` (a diary is startable and runnable)
- Test: the three route test files

**Interfaces:**
- Produces: `canRun(safetyState: string): boolean` in `src/lib/schemas/protocol.ts` — true for `approved` and `observe-only`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/schemas/protocol.test.ts`:

```ts
describe("canRun", () => {
  test("a diary runs, like an approved trial", () => {
    expect(canRun("observe-only")).toBe(true);
    expect(canRun("approved")).toBe(true);
  });
  test("nothing else does", () => {
    expect(canRun("pending")).toBe(false);
    expect(canRun("refused")).toBe(false);
  });
});
```

In `src/app/api/hunch/[id]/verdict/route.test.ts`:

```ts
it("refuses to compute a verdict for a diary", async () => {
  vi.mocked(db.hunch.findFirst).mockResolvedValue({
    ...concludedHunch,
    verdict: null,
    protocol: { ...concludedHunch.protocol, safetyState: "observe-only" },
  } as never);

  const res = await GET(request(), params);
  expect(res.status).toBe(409);
  expect(await res.json()).toMatchObject({
    error: "This one is a log, not a trial — there's nothing to compare it against.",
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Expected: `canRun is not defined`, and the verdict route computing a verdict from one arm.

- [ ] **Step 3: Implement**

Add `canRun` to `src/lib/schemas/protocol.ts`:

```ts
/**
 * May this protocol be started and logged against? A diary may: nothing about
 * it needs approving, because it schedules no change. Pending and refused may
 * not.
 */
export function canRun(safetyState: string): boolean {
  return safetyState === "approved" || safetyState === "observe-only";
}
```

Replace the `!== "approved"` gates in the start and check-in routes with `!canRun(...)`. In `src/lib/home.ts`, the same at both sites.

In the verdict route, before computing anything:

```ts
  // A diary has one arm. The engine compares two, and inventing a contrast the
  // data does not contain would be fabricating a result.
  if (hunch.protocol?.safetyState === "observe-only") {
    return NextResponse.json(
      { error: "This one is a log, not a trial — there's nothing to compare it against." },
      { status: 409 },
    );
  }
```

- [ ] **Step 4: Run everything and commit**

```bash
npx vitest run && npx tsc --noEmit && npm run lint
git add src/lib "src/app/api/hunch/[id]"
git commit -m "feat(protocol): let a diary start, log and end without a verdict"
```

---

### Task 5: The doors, on screen

**Files:**
- Create: `src/hooks/use-observe-only.ts`
- Modify: `src/components/hunch/new-hunch-form.tsx` (the blocked card)
- Modify: `src/components/hunch/protocol-view.tsx:209` (the refused card gains a door)
- Modify: `src/components/hunch/hunch-dashboard.tsx` (no meter for a diary)

- [ ] **Step 1: The blocked card**

When creation answers 422, the form renders the refusal instead of the error line, with two actions:

> **Hunch can't plan a trial that changes your medication.**
>
> Starting, stopping or adjusting a prescribed drug is a decision for you and your doctor. What it can do is keep the record: log how you feel each day while you take it exactly as prescribed, and if your doctor does change something, the log is already running.
>
> `[ Track it as it is ]` `[ Edit my hunch ]`

`Edit my hunch` returns to the textarea with the text intact — nothing typed is thrown away. `Track it as it is` re-submits with `observeOnly: true`, which skips the medication check and takes the diary path: create the hunch, sharpen it, then `POST /observe` rather than `/protocol`.

**The skip is safe and must be commented as such:** the user has been told the app will not schedule a medication change, and the diary path cannot schedule one — it has a single phase whose action is "change nothing".

- [ ] **Step 2: The refused card gains a door**

At `src/components/hunch/protocol-view.tsx:209`, below the existing refusal reason, add the same offer: a short line and a `Track it as it is` button calling `POST /observe`. Keep "Hunch is not medical advice — please talk to a doctor before trying this."

This is the change that turns the app's only dead end into a fork.

- [ ] **Step 3: The dashboard, for a diary**

When `protocol.safetyState === "observe-only"`: render no `BeliefMeter` and no `VerdictView`. Keep the adherence strip, the check-in and the tracker editor. In place of the meter, one line — *"A log, not a trial. Nothing to change, just the record."*

- [ ] **Step 4: Verify in the browser**

1. Type "do I sleep better if I skip my antidepressant" → the card appears, no hunch is created, and the network tab shows no model call.
2. `Edit my hunch` → the text is still there.
3. `Track it as it is` → a hunch exists, its protocol is `observe-only`, its plan is one phase saying change nothing.
4. Start it, log a day, confirm the adherence strip moves and no belief meter is drawn.
5. `GET /api/hunch/<id>/verdict` → 409 with the diary message.
6. Export it → the CSV has the logged day.

- [ ] **Step 5: Commit**

```bash
git add src/components src/hooks
git commit -m "feat(safety): give a refused hunch a door instead of a wall"
```

---

## Done when

- A medication-variation hunch is refused before any model call, with the offer of a diary.
- A refused trial offers the same door rather than dead-ending.
- A diary starts, logs, ends, exports — and never produces a verdict.
- `npm test` green, `tsc --noEmit` and `eslint` clean.

## Not in this plan

- **The condition check** ("are you diagnosed with…") — that is spec §2's Clarifier work, and asking it here would collect a health condition with nothing yet built to use it responsibly.
- **Blood pressure as two parameters with systolic primary** — a Coach instruction, better added alongside §2's device questions than bolted onto this.
- Spec §4, the mid-trial safety net.
