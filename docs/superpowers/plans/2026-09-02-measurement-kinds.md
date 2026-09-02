# Measurement Kinds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single `continuous` parameter type into `scale`, `count` and `amount` so each gets the control and validation it deserves, and give the verdict badge the user's own prediction to compare against.

**Architecture:** The four kinds are a presentation-and-validation concern only. The Bayesian engine keeps its two-value world (`binary | continuous`) behind one explicit mapping function, so nothing in `src/lib/bayes` changes. Existing rows migrate by a deterministic rule and keep working.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7 (custom client at `src/generated/prisma`), PostgreSQL, Zod 4, Vitest 4, shadcn on Base UI, Mastra agents on Claude Sonnet 5 via OpenRouter.

**Spec:** `docs/superpowers/specs/2026-09-02-parameters-and-safety-design.md` — sections 1, 6, and 7 ("Prediction capture" onward).

## Global Constraints

- **The engine never sees a new kind.** `computeBelief(rows, outcomeType)` takes `"binary" | "continuous"` and nothing else (`src/lib/bayes/index.ts:18`). Every call site converts first.
- **No commit trailers.** Never add `Co-Authored-By` or `Generated with` to any commit or PR in this repo.
- **Prisma client is custom-output.** After any schema or migration change: `npx prisma generate`, delete `.next`, restart dev. Import from `@/generated/prisma/client`, never `@prisma/client`.
- **Vitest collects `src/**/*.test.ts` only.** `.tsx` files are not collected — component behaviour is proven through the pure helpers they call, not through render tests.
- **Evals are separate:** `npm run test:eval` needs `OPENROUTER_API_KEY` and hits the live model. Never wire evals into `npm test`.
- **Scale granularity is fixed at 1–5.** The spec pins it; the Coach must not propose 1–10.
- **Copy carries no valence.** No "helped", "hurt", "better", "worse", "improved" in any user-facing string. This shipped in #23 and must not regress.

## Deviations from the spec, and why

Two, both deliberate. Update the spec's §1 to match when Task 1 lands.

1. **The field stays named `type`, not `kind`.** The spec writes `parameterKindSchema`. Renaming the Prisma column means a data-moving migration and edits in six files for no user-visible gain. The values change; the name does not.
2. **Backfill defaults to `amount`, not `count`.** The spec says "count otherwise". That is wrong on reflection: an existing row like "hours of sleep" with no unit would become a stepper, changing a control users already use. `amount` is the free number input — identical to today's behaviour — so it is the safe default and `count` is only chosen when explicitly labelled as one.

---

### Task 1: The four kinds and their validation

**Files:**
- Modify: `src/lib/schemas/parameter.ts:4` (the enum), `:74-88` (`validateParameterValue`)
- Test: `src/lib/schemas/parameter.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parameterTypeSchema` (values `"binary" | "scale" | "count" | "amount"`), `type ParameterType`, `validateParameterValue(param, value): string | null`, `SCALE_MIN = 1`, `SCALE_MAX = 5`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/schemas/parameter.test.ts`:

```ts
describe("parameterTypeSchema", () => {
  it("accepts the four measurement kinds", () => {
    for (const k of ["binary", "scale", "count", "amount"]) {
      expect(parameterTypeSchema.safeParse(k).success).toBe(true);
    }
  });
  it("no longer accepts the old continuous catch-all", () => {
    expect(parameterTypeSchema.safeParse("continuous").success).toBe(false);
  });
});

describe("validateParameterValue by kind", () => {
  it("holds a scale to 1-5 whatever bounds the row carries", () => {
    const p = { label: "Energy", type: "scale" as const, min: 1, max: 10 };
    expect(validateParameterValue(p, 3)).toBe(null);
    expect(validateParameterValue(p, 6)).toBe("Energy is a 1-5 rating.");
    expect(validateParameterValue(p, 0)).toBe("Energy is a 1-5 rating.");
  });
  it("requires a whole number that is not negative for a count", () => {
    const p = { label: "Coffees", type: "count" as const };
    expect(validateParameterValue(p, 3)).toBe(null);
    expect(validateParameterValue(p, 0)).toBe(null);
    expect(validateParameterValue(p, 2.5)).toBe("Coffees is a whole number.");
    expect(validateParameterValue(p, -1)).toBe("Coffees can't be negative.");
  });
  it("keeps honouring an amount's own bounds", () => {
    const p = { label: "Sleep", type: "amount" as const, min: 0, max: 14 };
    expect(validateParameterValue(p, 7.5)).toBe(null);
    expect(validateParameterValue(p, 15)).toBe("Sleep can't be above 14.");
    expect(validateParameterValue(p, -1)).toBe("Sleep can't be below 0.");
  });
  it("still only takes 1 or 0 for a binary", () => {
    const p = { label: "Walked", type: "binary" as const };
    expect(validateParameterValue(p, 1)).toBe(null);
    expect(validateParameterValue(p, 2)).toBe("Walked is a yes/no — log 1 or 0.");
  });
});
```

Add `parameterTypeSchema` to the file's existing import from `@/lib/schemas/parameter`.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/lib/schemas/parameter.test.ts`
Expected: FAIL — `parameterTypeSchema` accepts `"continuous"`, and the scale/count messages do not exist.

- [ ] **Step 3: Change the enum and the validator**

In `src/lib/schemas/parameter.ts`, replace the enum:

```ts
/**
 * How a parameter is logged. Four kinds because a bug count, a 1-5 mood rating
 * and a systolic reading off a cuff are not one thing: they need different
 * controls, different validation, and different answers to "can this person
 * actually produce this number?".
 *
 * The engine still sees only binary vs continuous — see `engineOutcomeType`.
 */
export const parameterTypeSchema = z.enum(["binary", "scale", "count", "amount"]);
export type ParameterType = z.infer<typeof parameterTypeSchema>;

/** A rating scale is always 1-5: five tap targets fit a phone row, and a
 *  self-rating is not precise to ten points. */
export const SCALE_MIN = 1;
export const SCALE_MAX = 5;
```

Replace the body of `validateParameterValue`:

```ts
export function validateParameterValue(
  param: { label: string; type: ParameterType; min?: number | null; max?: number | null },
  value: number,
): string | null {
  if (!Number.isFinite(value)) return `${param.label} needs a number.`;

  if (param.type === "binary") {
    return value === 0 || value === 1 ? null : `${param.label} is a yes/no — log 1 or 0.`;
  }

  // A scale's bounds are the kind's, not the row's: rows migrated from the old
  // free-number type can carry any min/max, and a 1-10 leftover would let a 7
  // through a control that only offers five taps.
  if (param.type === "scale") {
    return Number.isInteger(value) && value >= SCALE_MIN && value <= SCALE_MAX
      ? null
      : `${param.label} is a ${SCALE_MIN}-${SCALE_MAX} rating.`;
  }

  if (param.type === "count") {
    if (!Number.isInteger(value)) return `${param.label} is a whole number.`;
    if (value < 0) return `${param.label} can't be negative.`;
  }

  if (param.min != null && value < param.min) {
    return `${param.label} can't be below ${param.min}.`;
  }
  if (param.max != null && value > param.max) {
    return `${param.label} can't be above ${param.max}.`;
  }
  return null;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run src/lib/schemas/parameter.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove the tests bite**

Change `value >= SCALE_MIN` to `value >= 0` in the scale branch, re-run, and confirm the "holds a scale to 1-5" test fails. Put it back.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas/parameter.ts src/lib/schemas/parameter.test.ts
git commit -m "feat(parameters): split continuous into scale, count and amount"
```

---

### Task 2: One explicit door to the engine

**Files:**
- Modify: `src/lib/parameters.ts` (add `engineOutcomeType`)
- Modify: `src/app/api/hunch/[id]/verdict/route.ts:87`, `src/app/api/hunch/[id]/belief/route.ts:42`, `src/app/api/hunch/[id]/checkin/route.ts:126`, `src/lib/home.ts:137`
- Test: `src/lib/parameters.test.ts`

**Interfaces:**
- Consumes: `ParameterType` from Task 1.
- Produces: `engineOutcomeType(type: string | null | undefined): "binary" | "continuous"`.

**Why this task exists.** Four call sites currently write `(primary?.type ?? hypothesis.outcomeType) as "binary" | "continuous"`. That cast is a lie the moment a row says `"scale"`: TypeScript stops checking and `computeBelief` picks its model from a string it was never given. It happens to fall through to normal-normal today, which is right by luck, not design. This task replaces luck with a function.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/parameters.test.ts`:

```ts
describe("engineOutcomeType", () => {
  it("keeps binary binary", () => {
    expect(engineOutcomeType("binary")).toBe("binary");
  });
  it("sends every measured kind down the continuous path", () => {
    expect(engineOutcomeType("scale")).toBe("continuous");
    expect(engineOutcomeType("count")).toBe("continuous");
    expect(engineOutcomeType("amount")).toBe("continuous");
  });
  it("still understands rows written before the split", () => {
    expect(engineOutcomeType("continuous")).toBe("continuous");
  });
  it("falls back to continuous for an absent or unknown type", () => {
    expect(engineOutcomeType(null)).toBe("continuous");
    expect(engineOutcomeType(undefined)).toBe("continuous");
    expect(engineOutcomeType("nonsense")).toBe("continuous");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/parameters.test.ts`
Expected: FAIL — `engineOutcomeType is not defined`.

- [ ] **Step 3: Implement it**

Add to `src/lib/parameters.ts`:

```ts
/**
 * The only place a parameter kind becomes something the Bayesian engine
 * understands. `computeBelief` takes binary or continuous; scale, count and
 * amount are all continuous to the maths, and the difference between them is
 * about how a number is asked for, not how it is analysed.
 *
 * Only "binary" is binary. Anything else — including a legacy "continuous" row
 * and anything unrecognised — is continuous, because treating a real number as
 * a coin flip would silently corrupt a verdict, while the reverse merely widens
 * an interval.
 */
export function engineOutcomeType(
  type: string | null | undefined,
): "binary" | "continuous" {
  return type === "binary" ? "binary" : "continuous";
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/parameters.test.ts`
Expected: PASS.

- [ ] **Step 5: Replace all four unchecked casts**

In `src/app/api/hunch/[id]/verdict/route.ts:87` and `src/app/api/hunch/[id]/belief/route.ts:42`:

```ts
const outcomeType = engineOutcomeType(primary?.type ?? hunch.hypothesis.outcomeType);
```

In `src/app/api/hunch/[id]/checkin/route.ts:126`, replace the cast argument with `engineOutcomeType(primary?.type ?? hunch.hypothesis.outcomeType)`.

In `src/lib/home.ts:137`, replace `type: primary.type as "binary" | "continuous",` with `type: primary.type as ParameterType,` — home passes this to the check-in control, not the engine, so it wants the kind, not the engine's word for it.

Add the import to each file: `import { engineOutcomeType } from "@/lib/parameters";` (three routes), and `ParameterType` from `@/lib/schemas/parameter` in `home.ts`.

- [ ] **Step 6: Verify nothing casts to the engine's types any more**

Run: `grep -rn 'as "binary" | "continuous"' src --include=*.ts`
Expected: no matches.

Run: `npx tsc --noEmit && npm test`
Expected: clean, all green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/parameters.ts src/lib/parameters.test.ts src/lib/home.ts "src/app/api/hunch/[id]"
git commit -m "refactor(parameters): route every kind to the engine through one function"
```

---

### Task 3: Migrate the stored rows

**Files:**
- Modify: `prisma/schema.prisma:78`
- Create: `prisma/migrations/20260902000000_parameter_kinds/migration.sql`
- Modify: `src/lib/parameters.ts` (add `backfillKind`)
- Test: `src/lib/parameters.test.ts`

**Interfaces:**
- Consumes: `ParameterType` from Task 1.
- Produces: `backfillKind(row): ParameterType` — exported so the rule is testable in TypeScript, and mirrored in SQL.

- [ ] **Step 1: Write the failing test for the rule**

Append to `src/lib/parameters.test.ts`:

```ts
describe("backfillKind", () => {
  it("leaves binary alone", () => {
    expect(backfillKind({ type: "binary", unit: null, min: null, max: null })).toBe("binary");
  });
  it("reads a rating unit as a scale", () => {
    expect(backfillKind({ type: "continuous", unit: "1-10", min: 1, max: 10 })).toBe("scale");
    expect(backfillKind({ type: "continuous", unit: "1 - 5", min: null, max: null })).toBe("scale");
  });
  it("treats a real unit as an amount, bounds or not", () => {
    expect(backfillKind({ type: "continuous", unit: "°F", min: 50, max: 90 })).toBe("amount");
    expect(backfillKind({ type: "continuous", unit: "hours", min: null, max: null })).toBe("amount");
  });
  it("defaults to amount, so an existing free-number row keeps its control", () => {
    expect(backfillKind({ type: "continuous", unit: null, min: null, max: null })).toBe("amount");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/parameters.test.ts`
Expected: FAIL — `backfillKind is not defined`.

- [ ] **Step 3: Implement the rule**

Add to `src/lib/parameters.ts`:

```ts
/** "1-10", "1 - 5", "1–10" — a unit that is really a rating range. */
const RATING_UNIT = /^\d+\s*[-–]\s*\d+$/;

/**
 * The kind an existing row becomes. Deliberately conservative: anything not
 * clearly a rating becomes an `amount`, which is the free number input the row
 * already had. Guessing `count` would swap a working control for a stepper on
 * rows like "hours of sleep".
 */
export function backfillKind(row: {
  type: string;
  unit: string | null;
  min: number | null;
  max: number | null;
}): ParameterType {
  if (row.type === "binary") return "binary";
  if (row.unit && RATING_UNIT.test(row.unit.trim())) return "scale";
  return "amount";
}
```

Import `ParameterType` in `src/lib/parameters.ts` if it is not already imported.

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/parameters.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the Prisma comment**

In `prisma/schema.prisma`, change line 78 to:

```prisma
  type      String // "binary" | "scale" | "count" | "amount"
```

The column type is unchanged — this is a comment and a value-domain change, not a structural one.

- [ ] **Step 6: Write the migration, mirroring the rule exactly**

Create `prisma/migrations/20260902000000_parameter_kinds/migration.sql`:

```sql
-- Parameter.type gains three values in place of "continuous".
-- Mirrors backfillKind() in src/lib/parameters.ts: a unit that reads as a
-- rating range becomes a scale; everything else becomes an amount, which is
-- the free number input these rows already rendered.
UPDATE "Parameter"
SET "type" = 'scale'
WHERE "type" = 'continuous'
  AND "unit" ~ '^[0-9]+\s*[-–]\s*[0-9]+$';

UPDATE "Parameter"
SET "type" = 'amount'
WHERE "type" = 'continuous';
```

Order matters: the scale update must run first, because the second statement claims every remaining `continuous` row.

- [ ] **Step 7: Apply it and regenerate**

```bash
npm run db:up
npx prisma migrate dev --name parameter_kinds
npx prisma generate
rm -rf .next
```

Expected: migration applies cleanly; `prisma generate` reports the client written to `src/generated/prisma`.

- [ ] **Step 8: Verify no `continuous` rows survive**

```bash
docker exec hunch-db psql -U postgres -d hunch -c \
  "SELECT type, count(*) FROM \"Parameter\" GROUP BY type ORDER BY type;"
```

Expected: rows for `binary`, `amount`, and possibly `scale`. **No `continuous`.**

- [ ] **Step 9: Commit**

```bash
git add prisma src/lib/parameters.ts src/lib/parameters.test.ts
git commit -m "feat(parameters): migrate stored rows onto the four kinds"
```

---

### Task 4: Teach the Coach the kinds and the prediction

**Files:**
- Modify: `src/lib/schemas/hypothesis.ts` (add `expectedDirection`)
- Modify: `src/mastra/agents/hypothesis-coach.ts:22-53` (instructions)
- Modify: `src/lib/parameters.ts` (`draftsFromSharpened`)
- Modify: `prisma/schema.prisma` (Hypothesis model), new migration
- Modify: `src/app/api/hunch/route.ts` (persist the new field)
- Test: `src/lib/schemas/hypothesis.test.ts`, `src/lib/parameters.test.ts`

**Interfaces:**
- Consumes: `parameterTypeSchema` (Task 1), `backfillKind` (Task 3).
- Produces: `sharpenedHypothesisSchema` with `expectedDirection: "up" | "down"`; `draftsFromSharpened` emitting the four kinds.

- [ ] **Step 1: Write the failing schema test**

Append to `src/lib/schemas/hypothesis.test.ts`:

```ts
describe("expectedDirection", () => {
  const base = {
    statement: "Skipping my morning walk makes my code buggier.",
    outcomeMetric: "bugs found in review",
    outcomeType: "continuous" as const,
  };
  it("accepts up and down", () => {
    expect(sharpenedHypothesisSchema.safeParse({ ...base, expectedDirection: "up" }).success).toBe(true);
    expect(sharpenedHypothesisSchema.safeParse({ ...base, expectedDirection: "down" }).success).toBe(true);
  });
  it("rejects anything else", () => {
    expect(sharpenedHypothesisSchema.safeParse({ ...base, expectedDirection: "sideways" }).success).toBe(false);
  });
  it("is optional, so hypotheses written before the field still parse", () => {
    expect(sharpenedHypothesisSchema.safeParse(base).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/schemas/hypothesis.test.ts`
Expected: FAIL — `"sideways"` is accepted, because the field does not exist and unknown keys are stripped.

- [ ] **Step 3: Add the field**

In `src/lib/schemas/hypothesis.ts`, inside `sharpenedHypothesisSchema`:

```ts
  /**
   * Which way the user expects the outcome to move. The verdict badge compares
   * it against the measured sign to say Confirmed or Reversed — the app can
   * know direction, never whether a direction is good news.
   *
   * Optional: hypotheses sharpened before this field existed have none, and
   * their badge falls back to a plain direction word.
   */
  expectedDirection: z.enum(["up", "down"]).optional(),
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run src/lib/schemas/hypothesis.test.ts`
Expected: PASS.

- [ ] **Step 5: Persist it**

In `prisma/schema.prisma`, add to `model Hypothesis`:

```prisma
  /// "up" | "down" — the direction the user expects, for the verdict badge.
  expectedDirection String?
```

Then:

```bash
npx prisma migrate dev --name hypothesis_expected_direction
npx prisma generate
rm -rf .next
```

In `src/app/api/hunch/route.ts`, add `expectedDirection: sharpened.expectedDirection ?? null` to the `hypothesis.create` data block.

- [ ] **Step 6: Update the Coach's instructions**

In `src/mastra/agents/hypothesis-coach.ts`, replace the `outcomeType` and `trackers` rules with:

```
- outcomeType: "binary" if the outcome is naturally yes/no, "continuous" otherwise.
- expectedDirection: "up" if the hypothesis says the intervention RAISES the
  outcome metric, "down" if it lowers it. Read it off your own statement. For
  "Skipping my walk makes my code buggier" with outcome "bugs found", that is
  "up". This is only which way the number moves — never whether that is good.
- trackers: 0-4 OTHER things the person could log daily that help interpret the
  result. Each is { label, type, unit?, min?, max? }. Choose `type` from:
    "binary" — a yes/no tap ("Took my walk").
    "scale"  — a subjective rating. ALWAYS 1-5. Set unit "1-5", min 1, max 5.
               Never propose 1-10.
    "count"  — how many times something happened ("Coffees", "Bugs found").
               Whole numbers, no unit needed.
    "amount" — a measured quantity with a unit ("Sleep", unit "hours").
               ONLY when an ordinary person can get this number daily without
               buying an instrument. A phone gives sleep and steps; a kitchen
               scale gives weight. A hygrometer, a blood-pressure cuff and a
               glucose monitor do not count. When the honest measurement needs a
               device, propose the perceivable proxy instead as a "scale" or
               "binary" — for blood glucose, "Energy after lunch" 1-5.
  Never repeat the outcomeMetric as a tracker. Propose FEWER than four unless
  each one genuinely helps read the result; three padded trackers are worse
  than one good one.
```

- [ ] **Step 7: Map the kinds into the drafts**

`draftsFromSharpened` builds the primary from `outcomeType`, which is still the engine's two-value word. Give the primary a real kind:

```ts
export function draftsFromSharpened(s: {
  outcomeMetric: string;
  outcomeType: ParameterType | "continuous";
  trackers?: Tracker[];
}): ParameterDraft[] {
  const primary: ParameterDraft = {
    label: s.outcomeMetric,
    // The Coach reports outcomeType in the engine's vocabulary, so a primary
    // arrives as "continuous". Land it on the same conservative default the
    // migration uses rather than guessing a stepper or a rating.
    type: backfillKind({ type: s.outcomeType, unit: null, min: null, max: null }),
    isPrimary: true,
  };
  const trackers = (s.trackers ?? [])
    .filter((t) => !sameLabel(t.label, s.outcomeMetric))
    .slice(0, 4)
    .map((t) => ({ ...t, isPrimary: false }));
  return [primary, ...trackers];
}
```

- [ ] **Step 8: Test the mapping**

Append to `src/lib/parameters.test.ts`:

```ts
it("gives a continuous outcome metric the amount kind, not a stepper", () => {
  const [primary] = draftsFromSharpened({
    outcomeMetric: "hours of sleep",
    outcomeType: "continuous",
  });
  expect(primary.type).toBe("amount");
  expect(primary.isPrimary).toBe(true);
});
it("keeps a binary outcome metric binary", () => {
  const [primary] = draftsFromSharpened({ outcomeMetric: "slept well", outcomeType: "binary" });
  expect(primary.type).toBe("binary");
});
```

Run: `npx vitest run src/lib/parameters.test.ts`
Expected: PASS.

- [ ] **Step 9: Check the Coach live**

Run: `npm run test:eval -- src/mastra/agents/hypothesis-coach.eval.test.ts`
Expected: PASS. If the eval asserts `type` values of `"continuous"`, update it to the new kinds — that is a legitimate change, not a failure to work around.

- [ ] **Step 10: Commit**

```bash
git add src/lib/schemas/hypothesis.ts src/mastra/agents/hypothesis-coach.ts src/lib/parameters.ts src/lib/parameters.test.ts src/lib/schemas/hypothesis.test.ts prisma src/app/api/hunch/route.ts
git commit -m "feat(coach): propose real measurement kinds and the expected direction"
```

---

### Task 5: A control per kind

**Files:**
- Create: `src/components/ui/toggle-group.tsx` (from the shadcn registry)
- Modify: `src/components/check-in.tsx:202-241`
- Test: none — `.tsx` is not collected. The validation these controls enforce is already covered by Task 1.

**Interfaces:**
- Consumes: `ParameterType`, `SCALE_MIN`, `SCALE_MAX` (Task 1).
- Produces: no new exports.

- [ ] **Step 1: Add the primitive**

```bash
npx shadcn@latest add toggle-group
```

Expected: creates `src/components/ui/toggle-group.tsx` and `src/components/ui/toggle.tsx`. It must match the project's Base UI style (`components.json` sets `base-nova`) — if the generated file imports from Radix, stop and report it rather than hand-editing.

- [ ] **Step 2: Render a control per kind**

In `src/components/check-in.tsx`, replace the `p.type === "binary" ? (...) : (<Input .../>)` block with a switch on all four kinds. Keep the existing binary branch exactly as it is — including the `compact ? submit(...) : set(...)` behaviour, which is load-bearing on home.

```tsx
{p.type === "binary" ? (
  /* unchanged binary branch */
) : p.type === "scale" ? (
  <ToggleGroup
    value={entries[p.id] ? [entries[p.id]] : []}
    onValueChange={(v) => {
      const next = v[0];
      if (!next) return;
      compact ? submit({ id: p.id, raw: next }) : set(p.id, next);
    }}
    disabled={disabled}
    aria-label={p.label}
  >
    {Array.from({ length: SCALE_MAX - SCALE_MIN + 1 }, (_, i) => String(SCALE_MIN + i)).map((n) => (
      <ToggleGroupItem key={n} value={n} aria-label={`${p.label}: ${n}`}>
        {n}
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
) : p.type === "count" ? (
  <div className="flex items-center gap-2">
    <Button
      type="button"
      variant="brand"
      size="touch"
      disabled={disabled}
      aria-label={`One fewer ${p.label}`}
      onClick={() => set(p.id, String(Math.max(0, Number(entries[p.id] ?? 0) - 1)))}
    >
      <MinusIcon aria-hidden className="size-icon" />
    </Button>
    <span className="w-10 text-center font-mono text-lg" aria-live="polite">
      {entries[p.id] ?? 0}
    </span>
    <Button
      type="button"
      variant="brand"
      size="touch"
      disabled={disabled}
      aria-label={`One more ${p.label}`}
      onClick={() => set(p.id, String(Number(entries[p.id] ?? 0) + 1))}
    >
      <PlusIcon aria-hidden className="size-icon" />
    </Button>
  </div>
) : (
  <Input
    id={`checkin-${p.id}`}
    type="number"
    step="any"
    min={p.min ?? undefined}
    max={p.max ?? undefined}
    aria-label={p.label}
    value={entries[p.id] ?? ""}
    onChange={(e) => set(p.id, e.target.value)}
    placeholder={p.min != null && p.max != null ? `${p.min}–${p.max}` : "reading"}
    className="w-32 font-mono"
  />
)}
```

Add imports: `MinusIcon, PlusIcon` from `lucide-react`, `ToggleGroup, ToggleGroupItem` from `@/components/ui/toggle-group`, and `SCALE_MIN, SCALE_MAX` from `@/lib/schemas/parameter`.

- [ ] **Step 3: Fix the taps-only shortcut**

`compactTapsOnly` currently reads `shown.every((p) => p.type === "binary")`. A scale is also a one-tap interaction on home. Change it to:

```ts
const compactTapsOnly = compact && shown.every((p) => p.type === "binary" || p.type === "scale");
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean, 287+ green.

- [ ] **Step 5: See it in the browser**

Start the app, open a running hunch, and confirm: a scale renders five taps, a count renders −/+ with a number between them, an amount renders the number field, a binary is unchanged. Log one of each and confirm the value persists after a reload.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/toggle-group.tsx src/components/ui/toggle.tsx src/components/check-in.tsx
git commit -m "feat(check-in): give each measurement kind its own control"
```

---

### Task 6: Let the confirm gate pick a kind

**Files:**
- Modify: `src/components/hunch/parameter-editor.tsx:62-80`
- Test: none — `.tsx` is not collected.

**Interfaces:**
- Consumes: `ParameterType` (Task 1).
- Produces: no new exports.

- [ ] **Step 1: Replace the two-way toggle with a four-way one**

The editor currently flips between `binary` and `continuous` with a single button. Replace that control with a `ToggleGroup` over the four kinds, and set the scale's bounds when it is chosen — a scale row must carry `unit: "1-5"`, `min: 1`, `max: 5` so the check-in control and the validator agree:

```tsx
<ToggleGroup
  value={[row.type]}
  onValueChange={(v) => {
    const next = v[0] as ParameterType | undefined;
    if (!next) return;
    onChange(
      next === "scale"
        ? { ...row, type: next, unit: "1-5", min: SCALE_MIN, max: SCALE_MAX }
        : { ...row, type: next },
    );
  }}
  aria-label="How this is logged"
>
  {(["binary", "scale", "count", "amount"] as const).map((k) => (
    <ToggleGroupItem key={k} value={k} aria-label={KIND_LABEL[k]}>
      {KIND_LABEL[k]}
    </ToggleGroupItem>
  ))}
</ToggleGroup>
```

With, above the component:

```tsx
/** The kinds in the user's words, not the schema's. */
const KIND_LABEL: Record<ParameterType, string> = {
  binary: "yes / no",
  scale: "1-5",
  count: "how many",
  amount: "a number",
};
```

- [ ] **Step 2: Keep the unit and bounds fields for amounts only**

The unit/min/max inputs below the toggle are meaningless for `binary`, fixed for `scale`, and unused for `count`. Render them only when `row.type === "amount"`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean and green.

- [ ] **Step 4: See it in the browser**

Sharpen a new hunch, reach the confirm gate, switch a row to `1-5` and confirm the unit field disappears and the plan saves. Then open the check-in and confirm that row renders five taps.

- [ ] **Step 5: Commit**

```bash
git add src/components/hunch/parameter-editor.tsx
git commit -m "feat(confirm): choose a measurement kind per parameter"
```

---

### Task 7: Confirmed and Reversed on the badge

**Files:**
- Modify: `src/lib/verdict.ts` (add `verdictBadge`)
- Modify: `src/lib/schemas/verdict.ts` (carry `expectedDirection`)
- Modify: `src/app/api/hunch/[id]/verdict/route.ts` (supply it)
- Modify: `src/components/app/home-view.tsx:69-79`
- Modify: `src/lib/home.ts` (pass it through to the card)
- Test: `src/lib/verdict.test.ts`

**Interfaces:**
- Consumes: `VerdictCategory`, `verdictHeadline` (both shipped in #23).
- Produces: `verdictBadge(category, expectedDirection): string`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/verdict.test.ts`:

```ts
describe("verdictBadge", () => {
  it("says Confirmed when the effect went the way the user expected", () => {
    expect(verdictBadge("helped", "up")).toBe("Confirmed");
    expect(verdictBadge("hurt", "down")).toBe("Confirmed");
  });
  it("says Reversed when it went the other way", () => {
    expect(verdictBadge("helped", "down")).toBe("Reversed");
    expect(verdictBadge("hurt", "up")).toBe("Reversed");
  });
  it("keeps Reversed separate from Not confirmed", () => {
    expect(verdictBadge("inconclusive_no_effect", "up")).toBe("Not confirmed");
    expect(verdictBadge("helped", "down")).not.toBe("Not confirmed");
  });
  it("names the days when there weren't enough", () => {
    expect(verdictBadge("inconclusive_insufficient", "up")).toBe("Not enough days");
    expect(verdictBadge("inconclusive_insufficient", null)).toBe("Not enough days");
  });
  it("falls back to a direction word when no prediction was recorded", () => {
    expect(verdictBadge("helped", null)).toBe("Increase");
    expect(verdictBadge("hurt", null)).toBe("Decrease");
    expect(verdictBadge("inconclusive_no_effect", null)).toBe("No difference");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/verdict.test.ts`
Expected: FAIL — `verdictBadge is not defined`.

- [ ] **Step 3: Implement it**

Add to `src/lib/verdict.ts`:

```ts
/**
 * The scanning badge for a concluded trial.
 *
 * With a recorded prediction it answers the only question a list needs: did the
 * hunch hold up? Without one — every hypothesis sharpened before the Coach
 * wrote the field — it falls back to the direction, which is always knowable.
 *
 * `Reversed` is deliberately its own word. "Not confirmed" reads as a home for
 * both "the opposite happened" and "nothing happened", and a surprise reversal
 * is the most interesting result an experiment can produce.
 */
export function verdictBadge(
  category: VerdictCategory,
  expectedDirection: "up" | "down" | null | undefined,
): string {
  if (category === "inconclusive_insufficient") return "Not enough days";
  if (category === "inconclusive_no_effect") {
    return expectedDirection ? "Not confirmed" : "No difference";
  }
  const measured = category === "helped" ? "up" : "down";
  if (!expectedDirection) return measured === "up" ? "Increase" : "Decrease";
  return measured === expectedDirection ? "Confirmed" : "Reversed";
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run src/lib/verdict.test.ts`
Expected: PASS.

- [ ] **Step 5: Prove they bite**

Swap `"Confirmed"` and `"Reversed"` in the return, re-run, and confirm two tests fail. Put it back.

- [ ] **Step 6: Carry the prediction to the client**

In `src/lib/schemas/verdict.ts`, add to `verdictSchema`:

```ts
  /** The user's own prediction, for the badge. Absent on older hypotheses. */
  expectedDirection: z.enum(["up", "down"]).nullish(),
```

In `src/app/api/hunch/[id]/verdict/route.ts`, pass `hunch.hypothesis.expectedDirection` into both `toDto` calls, the way `outcome` is already passed.

In `src/lib/home.ts`, include `expectedDirection` on the concluded-card projection so home has it without another query.

- [ ] **Step 7: Use it on home**

In `src/components/app/home-view.tsx`, delete the `VERDICT_LABEL` record and call `verdictBadge(category, expectedDirection)` instead. Keep every badge on `text-neutral` — a colour would reintroduce the valence the whole change removes.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean and green.

- [ ] **Step 9: Commit**

```bash
git add src/lib/verdict.ts src/lib/verdict.test.ts src/lib/schemas/verdict.ts src/lib/home.ts src/components/app/home-view.tsx "src/app/api/hunch/[id]/verdict/route.ts"
git commit -m "feat(verdict): badge a result against the hunch it was testing"
```

---

## Done when

- No `Parameter` row has `type = 'continuous'`.
- `grep -rn 'as "binary" | "continuous"' src --include=*.ts` returns nothing.
- A check-in renders five taps for a scale, a stepper for a count, a number field for an amount, and the unchanged yes/no pair for a binary.
- A hunch sharpened after Task 4 shows `Confirmed` or `Reversed` on home; one sharpened before it shows `Increase`, `Decrease` or `No difference`.
- `npm test` green, `npm run test:eval` green, `tsc --noEmit` and `eslint` clean.

## Not in this plan

Deliberately deferred, each needing its own plan:

- **The device gate and the Clarifier** (spec §2) — the subject question, the measurability question, the reframe offer, `subject: self | other`, and keeping non-self results out of `CausalEdge`. Task 4 teaches the Coach to prefer proxies, which is the instruction half; the interactive gate is a separate build.
- **Health and medication** (spec §3) — observe-only as a third `safetyState`, the deterministic medication phrase check, the refusal copy.
- **The mid-trial safety net** (spec §4) — typo guard, personal outlier, published limits, the pause banner.
- **Mid-run parameter edits** (spec §5) — add a tracker, retire one softly, keep the primary frozen.
