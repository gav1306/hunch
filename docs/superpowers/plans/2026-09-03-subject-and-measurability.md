# Subject and Measurability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ask the two questions that decide whether a trial can survive — *which one?* and *can you actually get that number every day?* — at the moment the app is already asking questions. And stop a hunch about a houseplant becoming a belief about the user's body.

**Architecture:** No new screens. The Clarifier already renders up to three tappable questions before the Coach runs; the device gate is one of them. `subject` rides on the hypothesis and has exactly one consequence: a non-self result never becomes a prior.

**Tech Stack:** Next.js 16, React 19, Prisma 7 (custom client), PostgreSQL, Zod 4, Vitest 4, Mastra on Claude Sonnet 5 via OpenRouter.

**Spec:** `docs/superpowers/specs/2026-09-02-parameters-and-safety-design.md` §2.

## Global Constraints

- **Weirdness is never the trigger.** Sorting hunches by "is this unusual" gets it backwards in both directions: shopping-hungry is odd and perfectly measurable, blood glucose is ordinary and unmeasurable. The only question that sorts correctly is "can you produce this number daily?"
- **A non-self result never becomes a prior.** That is `subject`'s only job. The trial still runs, gets a verdict and exports.
- **No new UI.** The Clarifier's existing question list is the gate.
- **No commit trailers.**
- **Prisma is custom-output**: `npx prisma generate`, clear `.next`, restart dev after schema changes.

---

### Task 1: `subject: self | other`

**Files:** `src/lib/schemas/hypothesis.ts`, `prisma/schema.prisma`, `src/app/api/hunch/route.ts`, `src/app/api/hunch/[id]/sharpen/route.ts`, `src/mastra/agents/hypothesis-coach.ts`
**Test:** `src/lib/schemas/hypothesis.test.ts`

- [ ] **Step 1: Failing tests**

```ts
describe("subject", () => {
  const base = {
    statement: "My houseplants droop when I play music.",
    outcomeMetric: "droopiness rated 1-5",
    outcomeType: "continuous" as const,
  };
  test("accepts self and other", () => {
    expect(sharpenedHypothesisSchema.safeParse({ ...base, subject: "self" }).success).toBe(true);
    expect(sharpenedHypothesisSchema.safeParse({ ...base, subject: "other" }).success).toBe(true);
  });
  test("rejects anything else", () => {
    expect(sharpenedHypothesisSchema.safeParse({ ...base, subject: "plant" }).success).toBe(false);
  });
  test("defaults to self, which is what almost every hunch is", () => {
    expect(sharpenedHypothesisSchema.parse(base).subject).toBe("self");
  });
});
```

- [ ] **Step 2** Run, watch fail.

- [ ] **Step 3: Add the field**

```ts
  /**
   * Whose life this is about. Almost always the user; "other" covers a plant, a
   * pet, a room. Its only consequence is that a non-self result never becomes a
   * prior recalled into a hunch about the user's own body — otherwise "you
   * already learned music affects droopiness" turns up inside a sleep trial.
   */
  subject: z.enum(["self", "other"]).default("self"),
```

Add `subject String @default("self")` to the Prisma `Hypothesis` model, migrate, and persist it in both sharpen routes alongside `expectedDirection`.

- [ ] **Step 4: Tell the Coach**

```
- subject: "self" for a hunch about the person's own body, mood, work or habits —
  almost every hunch. "other" when the thing being measured is NOT the person: a
  houseplant, a pet, a room, a car.
```

- [ ] **Step 5** Run all tests, commit.

---

### Task 2: Keep a plant out of the user's model

**Files:** `src/lib/memory/causal-graph.ts`, `src/app/api/hunch/[id]/verdict/route.ts`
**Test:** `src/lib/memory/causal-graph.test.ts`

- [ ] **Step 1: Failing tests**

```ts
test("writes no edge for a hunch about something that isn't the user", () => {
  expect(writeEdgeData({ ...base, subject: "other" })).toBeNull();
});
test("still writes one for the user's own hunch", () => {
  expect(writeEdgeData({ ...base, subject: "self" })).not.toBeNull();
});
test("treats a missing subject as self, so older hunches keep working", () => {
  expect(writeEdgeData(base)).not.toBeNull();
});
```

- [ ] **Step 2** Run, watch fail.

- [ ] **Step 3: Implement**

`writeEdgeData` takes `subject?: string` and returns `null` when it is `"other"`, before anything else:

```ts
  // A plant's result is not a fact about this person. The trial still runs and
  // still gets a verdict; it simply never enters the model of *them*.
  if (input.subject === "other") return null;
```

Pass `hunch.hypothesis.subject` at the call site in the verdict route.

- [ ] **Step 4** Mutation-check: remove the guard, confirm the "other" test fails. Commit.

---

### Task 3: The Clarifier asks the two questions that matter

**Files:** `src/mastra/agents/clarifier.ts`
**Test:** `src/mastra/agents/clarifier.eval.test.ts` (live)

The Clarifier's brief is outcome / measurement / dose. It never asks the question that decides whether the trial survives.

- [ ] **Step 1: Rewrite the brief**

Replace the rules with:

```
Rules:
- Ask AT MOST 3 questions. Fewer is better. Only ask what genuinely changes the
  hypothesis.
- ALWAYS ask how they would measure the outcome, and phrase the options as the
  ways an ordinary person actually could. If the honest measure needs a device
  (a blood-pressure cuff, a glucose monitor, a hygrometer, a scale), one option
  must be "I have one" and another must be something they can perceive without
  it — "how my energy feels after lunch", "whether the air feels damp".
- If the hunch is about several of something ("my houseplants", "my kids"),
  ask WHICH ONE. An experiment measures one subject; averaging several is not
  a measurement of any of them.
- Otherwise ask about the outcome and the exact intervention (dose, timing,
  "entirely vs partly").
- Each question offers 2-4 concrete, tappable options phrased in the user's own
  world. Options must be distinct and realistic.
- Set allowOther true when a sensible answer might fall outside your options.
- id: a short stable slug ("outcome", "measure", "which", "dose").
- Never ask about medical history, a diagnosis, or anything a doctor should
  handle. You are working out what can be logged, not what is wrong with them.
```

- [ ] **Step 2: Extend the eval**

Add live cases asserting that a hygrometer-shaped hunch ("my houseplants droop when I play music") produces a *which one* question, and that a glucose-shaped hunch produces a measurement question offering a no-device option.

- [ ] **Step 3** Run `npm run test:eval`, commit.

---

### Task 4: Blood pressure is two parameters

**Files:** `src/mastra/agents/hypothesis-coach.ts`
**Test:** `src/mastra/agents/hypothesis-coach.eval.test.ts` (live)

- [ ] **Step 1: Add the instruction**

```
- Blood pressure is TWO parameters, never one: systolic as the primary
  (the number that moves first and most), diastolic as a tracker. Both are
  "amount" in mmHg, and only propose them at all if the person has said they
  have a cuff — otherwise offer what they can feel instead.
```

- [ ] **Step 2** Live-check with "my blood pressure is worse on stressful days" and confirm either two parameters with systolic primary, or a perceivable proxy. Commit.

---

## Done when

- A hunch about several plants gets asked which one.
- A device-shaped outcome is asked about with a no-device option offered.
- A non-self verdict writes no `CausalEdge`.
- `npm test` and `npm run test:eval` green.

## Not in this plan

- **A stored device inventory** ("you own a cuff") — the answer is used in the moment and not kept. Storing it is a profile feature with its own privacy questions.
- **The condition check.** Asking someone to name a diagnosis needs a clear, built answer for what happens next; §3 shipped observe-only, but nothing yet uses a stored condition, and collecting one before then would be gathering health data with no purpose.
- Spec §4, the mid-trial safety net.
