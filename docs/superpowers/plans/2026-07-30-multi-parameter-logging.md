# Multi-Parameter Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user confirm a set of daily parameters (one primary outcome + up to four trackers) before the experiment is designed, then log all of them each day, with only the primary driving the Bayesian verdict.

**Architecture:** Two new Prisma models — `Parameter` (per-hunch tracked thing) and `CheckInValue` (per-parameter reading inside the existing per-day `CheckIn` bucket); `CheckIn.value` is backfilled into `CheckInValue` and dropped. The Hypothesis Coach proposes trackers alongside the primary outcome; those are persisted as `Parameter` rows at sharpen time so a page reload never loses them, and the protocol-design request replaces that set with the user-confirmed list inside the same transaction that creates the `Protocol`. Every read path that used to read `CheckIn.value` goes through one pure helper that projects the primary parameter's values.

**Tech Stack:** Next.js 16 (App Router, RSC + client components), React 19, TanStack Query 5, Prisma 7 (custom client output `src/generated/prisma`, re-exported as `db` from `src/lib/db.ts`), PostgreSQL 17 (Docker, `npm run db:up`), Zod 4, Mastra 1.36 agents on Claude via Amazon Bedrock, Vitest 4.

## Global Constraints

- Exactly **one** `isPrimary = true` parameter per hunch — enforced in app logic and inside a transaction. No partial-unique index required for v1.
- At most **4 trackers** proposed by the LLM; the confirmed list is **1–5 parameters** total (primary + up to 4).
- The Bayesian engine (`computeBelief`) is **unchanged** and sees **only** the primary parameter's values. Secondary trackers never enter the statistical engine.
- Non-goals (do not build): per-parameter verdicts, cross-parameter correlation, editing parameters after the trial starts.
- Prisma has a custom client output path and Turbopack caches it: after **any** schema/migration change run `npx prisma generate`, then `rm -rf .next`, then restart the dev server.
- Never add `Co-Authored-By` or `Generated with` trailers to commits.
- UI is inline-style + CSS custom properties (`var(--ink)`, `var(--paper)`, `var(--muted)`, `var(--rule)`, `var(--s1)`, `var(--s2)`), fonts `'Clash Display',sans-serif` for headings and `'Space Mono',monospace` for labels/controls. Do **not** introduce shadcn/Tailwind components in this work.
- Every task ends with `npm run test` (Vitest) green before its commit step — no exceptions.
- `npm run typecheck` is green at the end of Tasks 1, 3, 4, 7, and 8. Tasks 2, 5, and 6 are mid-migration and end red **by design**: dropping `CheckIn.value` breaks its readers until Task 6, and the design-mutation signature breaks the protocol page until Task 7. Each of those tasks names the exact files expected to still fail; anything failing beyond that list is a real defect. Task 8 restores a fully clean typecheck.

---

## File Structure

**Create:**
- `src/lib/schemas/parameter.ts` — all parameter zod schemas + value validation (LLM tracker shape, client draft, persisted DTO, check-in payload).
- `src/lib/schemas/parameter.test.ts` — tests for the above.
- `src/lib/parameters.ts` — pure helpers shared by routes and UI (drafts from a sharpened hypothesis, pick primary, project belief rows).
- `src/lib/parameters.test.ts` — tests for the above.
- `prisma/migrations/20260730120000_multi_parameter_logging/migration.sql` — new tables, backfill, drop `CheckIn.value`.
- `src/components/hunch/parameter-editor.tsx` — the confirm-gate "things to track" editor.
- `src/app/api/hunch/route.test.ts` — sharpen-route parameter-persistence tests.
- `src/app/api/hunch/[id]/protocol/route.test.ts` — design-route validation tests.
- `src/app/api/hunch/[id]/checkin/route.test.ts` — check-in multi-value tests.

**Modify:**
- `prisma/schema.prisma` — `Parameter`, `CheckInValue`, `Hunch.parameters`, `CheckIn.values`, drop `CheckIn.value`.
- `src/lib/schemas/hypothesis.ts` — add `trackers` to `sharpenedHypothesisSchema`.
- `src/lib/schemas/belief.ts` — remove `checkInInputSchema` (superseded by `checkInValuesInputSchema`).
- `src/lib/schemas/belief.test.ts` — drop the `checkInInputSchema` block.
- `src/mastra/agents/hypothesis-coach.ts` — instruction rule for trackers.
- `src/app/api/hunch/route.ts` — persist proposed parameters at sharpen time; return them.
- `src/app/api/hunch/[id]/route.ts` — return `parameters`.
- `src/app/api/hunch/[id]/protocol/route.ts` — accept + persist the confirmed parameter list in the protocol transaction.
- `src/app/api/hunch/[id]/checkin/route.ts` — multi-value upsert + per-parameter validation.
- `src/app/api/hunch/[id]/belief/route.ts` — read primary values.
- `src/app/api/hunch/[id]/verdict/route.ts` — read primary values.
- `src/lib/home.ts` — expose the primary parameter for the home quick-log.
- `src/hooks/use-hunch-info.ts` — `parameters` + `outcomeType` on the read model.
- `src/hooks/use-create-hunch.ts` — `parameters` on the sharpen response.
- `src/hooks/use-design-protocol.ts` — mutation takes the confirmed list.
- `src/hooks/use-checkin.ts` — mutation takes `{ parameterId, value }[]`.
- `src/components/hunch/new-hunch-form.tsx` — seed the cache with parameters.
- `src/app/hunch/[id]/protocol/page.tsx` — mount the editor in the confirm gate.
- `src/components/checkin-tap.tsx` — one input per parameter, one submit.
- `src/components/app/home-view.tsx` — quick-log writes the primary parameter.
- `src/app/hunch/[id]/page.tsx` — pass parameters down to `CheckInTap`.

---

### Task 1: Parameter schemas

**Files:**
- Create: `src/lib/schemas/parameter.ts`
- Create: `src/lib/schemas/parameter.test.ts`
- Modify: `src/lib/schemas/hypothesis.ts`
- Modify: `src/lib/schemas/hypothesis.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parameterTypeSchema`, `ParameterType`, `trackerSchema`, `Tracker`, `parameterDraftSchema`, `ParameterDraft`, `parameterListSchema`, `parameterSchema`, `Parameter`, `checkInValuesInputSchema`, `CheckInValuesInput`, `validateParameterValue(param, value): string | null`. `sharpenedHypothesisSchema` gains `trackers: Tracker[]` (defaults to `[]`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/schemas/parameter.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  checkInValuesInputSchema,
  parameterDraftSchema,
  parameterListSchema,
  trackerSchema,
  validateParameterValue,
} from "@/lib/schemas/parameter";

describe("trackerSchema", () => {
  test("accepts a bounded scale tracker", () => {
    const r = trackerSchema.safeParse({
      label: "stress",
      type: "continuous",
      unit: "1-10",
      min: 1,
      max: 10,
    });
    expect(r.success).toBe(true);
  });

  test("accepts a bare binary tracker", () => {
    const r = trackerSchema.safeParse({ label: "napped", type: "binary" });
    expect(r.success).toBe(true);
  });

  test("rejects an empty label", () => {
    expect(trackerSchema.safeParse({ label: "  ", type: "binary" }).success).toBe(false);
  });

  test("rejects an unknown type", () => {
    expect(trackerSchema.safeParse({ label: "mood", type: "ordinal" }).success).toBe(false);
  });
});

describe("parameterListSchema", () => {
  const primary = { label: "hours of sleep", type: "continuous" as const, isPrimary: true };
  const tracker = { label: "caffeine", type: "binary" as const, isPrimary: false };

  test("accepts one primary plus trackers", () => {
    expect(parameterListSchema.safeParse([primary, tracker]).success).toBe(true);
  });

  test("rejects an empty list", () => {
    expect(parameterListSchema.safeParse([]).success).toBe(false);
  });

  test("rejects two primaries", () => {
    const r = parameterListSchema.safeParse([primary, { ...tracker, isPrimary: true }]);
    expect(r.success).toBe(false);
  });

  test("rejects no primary", () => {
    expect(parameterListSchema.safeParse([tracker]).success).toBe(false);
  });

  test("rejects more than five parameters", () => {
    const many = [primary, ...Array.from({ length: 5 }, (_, i) => ({ ...tracker, label: `t${i}` }))];
    expect(parameterListSchema.safeParse(many).success).toBe(false);
  });

  test("rejects min >= max", () => {
    const r = parameterListSchema.safeParse([{ ...primary, min: 10, max: 1 }]);
    expect(r.success).toBe(false);
  });

  test("defaults isPrimary to false when omitted", () => {
    const r = parameterDraftSchema.safeParse({ label: "mood", type: "continuous" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isPrimary).toBe(false);
  });
});

describe("checkInValuesInputSchema", () => {
  test("accepts one or more readings", () => {
    const r = checkInValuesInputSchema.safeParse({
      values: [{ parameterId: "p1", value: 7 }],
    });
    expect(r.success).toBe(true);
  });

  test("rejects an empty payload", () => {
    expect(checkInValuesInputSchema.safeParse({ values: [] }).success).toBe(false);
  });

  test("rejects a non-numeric value", () => {
    const r = checkInValuesInputSchema.safeParse({
      values: [{ parameterId: "p1", value: "7" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("validateParameterValue", () => {
  const scale = { label: "focus", type: "continuous" as const, min: 1, max: 10 };

  test("accepts a value inside the bounds", () => {
    expect(validateParameterValue(scale, 7)).toBeNull();
  });

  test("rejects a value outside the bounds, naming the parameter", () => {
    const msg = validateParameterValue(scale, 42);
    expect(msg).not.toBeNull();
    expect(msg).toContain("focus");
  });

  test("accepts any finite number when unbounded", () => {
    expect(validateParameterValue({ label: "hrs", type: "continuous" }, -3.5)).toBeNull();
  });

  test("rejects a non-finite number", () => {
    expect(validateParameterValue({ label: "hrs", type: "continuous" }, Number.NaN)).not.toBeNull();
  });

  test("accepts only 0 or 1 for a binary parameter", () => {
    const binary = { label: "napped", type: "binary" as const };
    expect(validateParameterValue(binary, 1)).toBeNull();
    expect(validateParameterValue(binary, 0)).toBeNull();
    expect(validateParameterValue(binary, 0.5)).not.toBeNull();
  });
});
```

Add to `src/lib/schemas/hypothesis.test.ts`, inside the existing `describe("sharpenedHypothesisSchema", ...)` block:

```ts
  test("defaults trackers to an empty array when omitted", () => {
    const r = sharpenedHypothesisSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.trackers).toEqual([]);
  });

  test("accepts up to four proposed trackers", () => {
    const trackers = Array.from({ length: 4 }, (_, i) => ({
      label: `tracker ${i}`,
      type: "binary" as const,
    }));
    expect(sharpenedHypothesisSchema.safeParse({ ...valid, trackers }).success).toBe(true);
  });

  test("rejects more than four proposed trackers", () => {
    const trackers = Array.from({ length: 5 }, (_, i) => ({
      label: `tracker ${i}`,
      type: "binary" as const,
    }));
    expect(sharpenedHypothesisSchema.safeParse({ ...valid, trackers }).success).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/schemas/parameter.test.ts src/lib/schemas/hypothesis.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/schemas/parameter"` and the hypothesis `trackers` tests failing on `undefined`.

- [ ] **Step 3: Write the schemas**

Create `src/lib/schemas/parameter.ts`:

```ts
import { z } from "zod";

/** How a parameter is logged: a yes/no tap or a number. */
export const parameterTypeSchema = z.enum(["binary", "continuous"]);
export type ParameterType = z.infer<typeof parameterTypeSchema>;

/**
 * A co-variable the Coach proposes alongside the primary outcome — the
 * "alternative parameters or symptoms" the user logs daily for context.
 */
export const trackerSchema = z.object({
  label: z.string().trim().min(1),
  type: parameterTypeSchema,
  /** Display unit, e.g. "hrs", "1-10". */
  unit: z.string().trim().min(1).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});
export type Tracker = z.infer<typeof trackerSchema>;

/** One row of the confirm gate's editable list. */
export const parameterDraftSchema = trackerSchema.extend({
  /** The one parameter that drives the Bayesian verdict. */
  isPrimary: z.boolean().default(false),
});
export type ParameterDraft = z.infer<typeof parameterDraftSchema>;

/**
 * The confirmed set the user sends when they approve the plan: the primary
 * outcome plus up to four trackers, with exactly one primary.
 */
export const parameterListSchema = z
  .array(parameterDraftSchema)
  .min(1)
  .max(5)
  .refine((rows) => rows.filter((r) => r.isPrimary).length === 1, {
    message: "Exactly one parameter must be the primary outcome.",
  })
  .refine(
    (rows) => rows.every((r) => r.min === undefined || r.max === undefined || r.min < r.max),
    { message: "A parameter's lowest value must be below its highest." },
  );

/** A persisted parameter, as the API hands it to the client. */
export const parameterSchema = parameterDraftSchema.extend({
  id: z.string().min(1),
  sortOrder: z.number().int().min(0),
});
export type Parameter = z.infer<typeof parameterSchema>;

/**
 * What the client sends on a check-in: one reading per parameter it has a
 * value for. Phase and date stay server-derived; partial payloads are fine.
 */
export const checkInValuesInputSchema = z.object({
  values: z
    .array(z.object({ parameterId: z.string().min(1), value: z.number() }))
    .min(1),
});
export type CheckInValuesInput = z.infer<typeof checkInValuesInputSchema>;

/**
 * Is this reading loggable for this parameter? Returns null when it is, or a
 * user-facing reason when it is not. Shared by the check-in route and the UI so
 * both reject the same things with the same words.
 */
export function validateParameterValue(
  param: { label: string; type: ParameterType; min?: number | null; max?: number | null },
  value: number,
): string | null {
  if (!Number.isFinite(value)) return `${param.label} needs a number.`;
  if (param.type === "binary") {
    return value === 0 || value === 1 ? null : `${param.label} is a yes/no — log 1 or 0.`;
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

Modify `src/lib/schemas/hypothesis.ts` — add the import and the field:

```ts
import { z } from "zod";
import { trackerSchema } from "@/lib/schemas/parameter";
```

and inside `sharpenedHypothesisSchema`, after `confounders`:

```ts
  /**
   * Extra things worth logging daily next to the outcome — context for reading
   * the result. Never verdicted. Empty when nothing obvious applies.
   */
  trackers: z.array(trackerSchema).max(4).default([]),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/schemas/parameter.test.ts src/lib/schemas/hypothesis.test.ts`
Expected: PASS (all tests in both files).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm run test && npm run typecheck`
Expected: all tests pass, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/schemas/parameter.ts src/lib/schemas/parameter.test.ts src/lib/schemas/hypothesis.ts src/lib/schemas/hypothesis.test.ts
git commit -m "feat(schema): parameter + tracker zod schemas"
```

---

### Task 2: Prisma models, migration, and backfill

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260730120000_multi_parameter_logging/migration.sql`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: Prisma models `Parameter { id, hunchId, label, type, unit?, min?, max?, isPrimary, sortOrder, hunch, values }` and `CheckInValue { id, checkInId, parameterId, value, checkIn, parameter }`; `Hunch.parameters: Parameter[]`; `CheckIn.values: CheckInValue[]`; `CheckIn.value` no longer exists. Client accessors: `db.parameter`, `db.checkInValue`.

- [ ] **Step 1: Start the database**

Run: `npm run db:up`
Expected: `hunch-db` container healthy. (It is Postgres 17, so `gen_random_uuid()` is built in — the backfill relies on it.)

- [ ] **Step 2: Edit the Prisma schema**

In `prisma/schema.prisma`, add `parameters Parameter[]` to `Hunch` (next to `checkIns CheckIn[]`):

```prisma
  hypothesis Hypothesis?
  protocol   Protocol?
  parameters Parameter[]
  checkIns   CheckIn[]
  verdict    Verdict?
```

Replace the `CheckIn` model's `value` line with the child relation, and add both new models after `CheckIn`:

```prisma
model CheckIn {
  id       String   @id @default(cuid())
  hunchId  String
  phase    String // which protocol phase label (A / B) at time of logging
  loggedOn DateTime @db.Date // UTC calendar date; one check-in per day
  loggedAt DateTime @default(now())

  hunch  Hunch          @relation(fields: [hunchId], references: [id], onDelete: Cascade)
  values CheckInValue[]

  @@unique([hunchId, loggedOn])
  @@index([hunchId, loggedAt])
}

/// One thing the user logs daily. Exactly one row per hunch is `isPrimary` —
/// that one drives the Bayesian verdict; the rest are context trackers.
model Parameter {
  id        String  @id @default(cuid())
  hunchId   String
  label     String // human label, e.g. "hours of sleep"
  type      String // "binary" | "continuous"
  unit      String? // optional display unit, e.g. "hrs", "1-10"
  min       Float? // optional bound (continuous scales)
  max       Float?
  isPrimary Boolean @default(false)
  sortOrder Int     @default(0)

  hunch  Hunch          @relation(fields: [hunchId], references: [id], onDelete: Cascade)
  values CheckInValue[]

  @@index([hunchId])
}

/// One reading of one parameter inside a day's check-in bucket.
model CheckInValue {
  id          String @id @default(cuid())
  checkInId   String
  parameterId String
  value       Float // 1/0 for binary, the measure for continuous

  checkIn   CheckIn   @relation(fields: [checkInId], references: [id], onDelete: Cascade)
  parameter Parameter @relation(fields: [parameterId], references: [id], onDelete: Cascade)

  @@unique([checkInId, parameterId])
  @@index([parameterId])
}
```

- [ ] **Step 3: Write the migration by hand (do NOT let Prisma generate it — the backfill must run between the create and the drop)**

Create `prisma/migrations/20260730120000_multi_parameter_logging/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "Parameter" (
    "id" TEXT NOT NULL,
    "hunchId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "unit" TEXT,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Parameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInValue" (
    "id" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,
    "parameterId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CheckInValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Parameter_hunchId_idx" ON "Parameter"("hunchId");

-- CreateIndex
CREATE INDEX "CheckInValue_parameterId_idx" ON "CheckInValue"("parameterId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckInValue_checkInId_parameterId_key" ON "CheckInValue"("checkInId", "parameterId");

-- AddForeignKey
ALTER TABLE "Parameter" ADD CONSTRAINT "Parameter_hunchId_fkey" FOREIGN KEY ("hunchId") REFERENCES "Hunch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInValue" ADD CONSTRAINT "CheckInValue_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "CheckIn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInValue" ADD CONSTRAINT "CheckInValue_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "Parameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing hypothesis becomes one primary parameter.
INSERT INTO "Parameter" ("id", "hunchId", "label", "type", "unit", "min", "max", "isPrimary", "sortOrder")
SELECT gen_random_uuid()::text, h."hunchId", h."outcomeMetric", h."outcomeType", NULL, NULL, NULL, true, 0
FROM "Hypothesis" h;

-- Backfill: every existing reading moves onto its hunch's primary parameter.
INSERT INTO "CheckInValue" ("id", "checkInId", "parameterId", "value")
SELECT gen_random_uuid()::text, c."id", p."id", c."value"
FROM "CheckIn" c
JOIN "Parameter" p ON p."hunchId" = c."hunchId" AND p."isPrimary" = true;

-- DropColumn (superseded by CheckInValue)
ALTER TABLE "CheckIn" DROP COLUMN "value";
```

- [ ] **Step 4: Apply the migration and regenerate the client**

Run:

```bash
npx prisma migrate dev --skip-generate
npx prisma generate
rm -rf .next
```

Expected: `Applied migration 20260730120000_multi_parameter_logging`, then `Generated Prisma Client`. If `migrate dev` reports drift and offers a reset, the dev DB is disposable — answer yes only if you have no data you care about; otherwise fix the drift first.

- [ ] **Step 5: Verify the backfill landed**

Run:

```bash
docker exec hunch-db psql -U postgres -d hunch -c \
  'SELECT (SELECT count(*) FROM "Hypothesis") AS hypotheses,
          (SELECT count(*) FROM "Parameter" WHERE "isPrimary") AS primaries,
          (SELECT count(*) FROM "CheckIn") AS checkins,
          (SELECT count(*) FROM "CheckInValue") AS values;'
```

Expected: `primaries` equals `hypotheses`, and `values` equals `checkins`. Also confirm the old column is gone:

```bash
docker exec hunch-db psql -U postgres -d hunch -c '\d "CheckIn"'
```

Expected: no `value` column in the output.

- [ ] **Step 6: Confirm the type error surface**

Run: `npm run typecheck`
Expected: FAIL, listing every site that still reads `CheckIn.value` — `src/app/api/hunch/[id]/checkin/route.ts`, `src/app/api/hunch/[id]/belief/route.ts`, `src/app/api/hunch/[id]/verdict/route.ts`. This is the expected red state; Tasks 3–6 clear it. Do not "fix" them here.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260730120000_multi_parameter_logging
git commit -m "feat(db): Parameter + CheckInValue models with backfill"
```

---

### Task 3: Pure parameter helpers

**Files:**
- Create: `src/lib/parameters.ts`
- Create: `src/lib/parameters.test.ts`

**Interfaces:**
- Consumes: `ParameterDraft`, `Parameter`, `Tracker`, `ParameterType` from `@/lib/schemas/parameter` (Task 1); `CheckInRow` from `@/lib/bayes`.
- Produces:
  - `draftsFromSharpened(s: { outcomeMetric: string; outcomeType: ParameterType; trackers?: Tracker[] }): ParameterDraft[]`
  - `pickPrimary<T extends { isPrimary: boolean }>(rows: T[]): T | null`
  - `primaryBeliefRows(checkIns: CheckInWithValues[], primaryId: string | null | undefined): CheckInRow[]`
  - `toParameterDto(row: ParameterRow): Parameter` — the null→undefined boundary between Prisma and the zod DTO
  - types `CheckInWithValues = { phase: string; values: { parameterId: string; value: number }[] }` and `ParameterRow = { id: string; label: string; type: string; unit: string | null; min: number | null; max: number | null; isPrimary: boolean; sortOrder: number }`

**Why `toParameterDto` exists:** Prisma returns `unit`/`min`/`max` as `null`; `parameterSchema` (and therefore `parameterListSchema`, which gates the design request) treats them as *optional*, so a raw `null` from the API would fail validation on the confirm gate. Every route that returns parameters maps through this function.

- [ ] **Step 1: Write the failing test**

Create `src/lib/parameters.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  draftsFromSharpened,
  pickPrimary,
  primaryBeliefRows,
  toParameterDto,
} from "@/lib/parameters";
import { parameterSchema } from "@/lib/schemas/parameter";

describe("draftsFromSharpened", () => {
  test("makes the outcome metric the primary, first in order", () => {
    const rows = draftsFromSharpened({
      outcomeMetric: "hours of sleep from a tracker",
      outcomeType: "continuous",
      trackers: [{ label: "caffeine after 2pm", type: "binary" }],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      label: "hours of sleep from a tracker",
      type: "continuous",
      isPrimary: true,
    });
    expect(rows[1]).toMatchObject({ label: "caffeine after 2pm", isPrimary: false });
  });

  test("works with no trackers at all", () => {
    const rows = draftsFromSharpened({ outcomeMetric: "mood", outcomeType: "binary" });
    expect(rows).toHaveLength(1);
    expect(rows[0].isPrimary).toBe(true);
  });

  test("drops trackers beyond the fourth", () => {
    const trackers = Array.from({ length: 6 }, (_, i) => ({
      label: `t${i}`,
      type: "binary" as const,
    }));
    const rows = draftsFromSharpened({ outcomeMetric: "m", outcomeType: "binary", trackers });
    expect(rows).toHaveLength(5);
  });

  test("never lets a tracker duplicate the primary label", () => {
    const rows = draftsFromSharpened({
      outcomeMetric: "hours of sleep",
      outcomeType: "continuous",
      trackers: [{ label: "hours of sleep", type: "continuous" }],
    });
    expect(rows).toHaveLength(1);
  });

  test("carries unit and bounds through", () => {
    const rows = draftsFromSharpened({
      outcomeMetric: "m",
      outcomeType: "binary",
      trackers: [{ label: "stress", type: "continuous", unit: "1-10", min: 1, max: 10 }],
    });
    expect(rows[1]).toMatchObject({ unit: "1-10", min: 1, max: 10 });
  });
});

describe("toParameterDto", () => {
  const row = {
    id: "p1",
    label: "stress",
    type: "continuous",
    unit: null,
    min: null,
    max: null,
    isPrimary: true,
    sortOrder: 0,
  };

  test("turns Prisma nulls into undefined so the zod DTO accepts it", () => {
    const dto = toParameterDto(row);
    expect(dto.unit).toBeUndefined();
    expect(dto.min).toBeUndefined();
    expect(dto.max).toBeUndefined();
    expect(parameterSchema.safeParse(dto).success).toBe(true);
  });

  test("keeps real values", () => {
    const dto = toParameterDto({ ...row, unit: "1-10", min: 1, max: 10 });
    expect(dto).toMatchObject({ unit: "1-10", min: 1, max: 10 });
  });
});

describe("pickPrimary", () => {
  test("returns the primary row", () => {
    const rows = [
      { id: "a", isPrimary: false },
      { id: "b", isPrimary: true },
    ];
    expect(pickPrimary(rows)?.id).toBe("b");
  });

  test("returns null when there is none", () => {
    expect(pickPrimary([{ id: "a", isPrimary: false }])).toBeNull();
  });
});

describe("primaryBeliefRows", () => {
  const checkIns = [
    { phase: "A", values: [{ parameterId: "p1", value: 7 }, { parameterId: "p2", value: 1 }] },
    { phase: "B", values: [{ parameterId: "p2", value: 0 }] },
    { phase: "B", values: [{ parameterId: "p1", value: 5 }] },
  ];

  test("keeps only the primary parameter's readings, with their phase", () => {
    expect(primaryBeliefRows(checkIns, "p1")).toEqual([
      { phase: "A", value: 7 },
      { phase: "B", value: 5 },
    ]);
  });

  test("returns nothing when there is no primary", () => {
    expect(primaryBeliefRows(checkIns, null)).toEqual([]);
  });

  test("skips days where the primary was not logged", () => {
    expect(primaryBeliefRows([{ phase: "A", values: [] }], "p1")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/parameters.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/parameters"`.

- [ ] **Step 3: Write the helpers**

Create `src/lib/parameters.ts`:

```ts
import type { CheckInRow } from "@/lib/bayes";
import type {
  Parameter,
  ParameterDraft,
  ParameterType,
  Tracker,
} from "@/lib/schemas/parameter";

/** A day's check-in with its per-parameter readings, as read from the DB. */
export type CheckInWithValues = {
  phase: string;
  values: { parameterId: string; value: number }[];
};

/** A Parameter row exactly as Prisma hands it back. */
export type ParameterRow = {
  id: string;
  label: string;
  type: string;
  unit: string | null;
  min: number | null;
  max: number | null;
  isPrimary: boolean;
  sortOrder: number;
};

/**
 * DB row -> API DTO. Prisma nulls become undefined so the client's parameter
 * schemas (which treat unit/min/max as optional) validate what we send back —
 * a stray null would otherwise fail the confirm gate's design check.
 */
export function toParameterDto(row: ParameterRow): Parameter {
  return {
    id: row.id,
    label: row.label,
    type: row.type as ParameterType,
    unit: row.unit ?? undefined,
    min: row.min ?? undefined,
    max: row.max ?? undefined,
    isPrimary: row.isPrimary,
    sortOrder: row.sortOrder,
  };
}

/** Case-insensitive label match — trackers must not restate the primary. */
function sameLabel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The starting parameter set for a freshly sharpened hunch: the outcome metric
 * as the primary, then the Coach's proposed trackers. Capped at four trackers;
 * duplicates of the primary are dropped so the user never sees the same row twice.
 */
export function draftsFromSharpened(s: {
  outcomeMetric: string;
  outcomeType: ParameterType;
  trackers?: Tracker[];
}): ParameterDraft[] {
  const primary: ParameterDraft = {
    label: s.outcomeMetric,
    type: s.outcomeType,
    isPrimary: true,
  };
  const trackers = (s.trackers ?? [])
    .filter((t) => !sameLabel(t.label, s.outcomeMetric))
    .slice(0, 4)
    .map((t) => ({ ...t, isPrimary: false }));
  return [primary, ...trackers];
}

/** The one parameter that drives the verdict, or null when the set has none. */
export function pickPrimary<T extends { isPrimary: boolean }>(rows: T[]): T | null {
  return rows.find((r) => r.isPrimary) ?? null;
}

/**
 * Project day-buckets down to what the Bayesian engine consumes: the primary
 * parameter's reading per day, tagged with that day's phase. Secondary trackers
 * are dropped here — they never reach the statistics.
 */
export function primaryBeliefRows(
  checkIns: CheckInWithValues[],
  primaryId: string | null | undefined,
): CheckInRow[] {
  if (!primaryId) return [];
  const rows: CheckInRow[] = [];
  for (const c of checkIns) {
    const hit = c.values.find((v) => v.parameterId === primaryId);
    if (hit) rows.push({ phase: c.phase, value: hit.value });
  }
  return rows;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/parameters.test.ts`
Expected: PASS (all 12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/parameters.ts src/lib/parameters.test.ts
git commit -m "feat(parameters): pure helpers for drafts, primary, belief rows"
```

---

### Task 4: Coach proposes trackers; sharpen persists the parameter set

**Files:**
- Modify: `src/mastra/agents/hypothesis-coach.ts`
- Modify: `src/app/api/hunch/route.ts`
- Create: `src/app/api/hunch/route.test.ts`

**Interfaces:**
- Consumes: `draftsFromSharpened`, `toParameterDto` (Task 3), `sharpenedHypothesisSchema.trackers` (Task 1), `db.parameter` (Task 2).
- Produces: `POST /api/hunch` response body `{ hunch: { …, hypothesis, parameters: Parameter[] }, priors }`, where each `parameters` entry is `{ id, label, type, unit?, min?, max?, isPrimary, sortOrder }`.

**Decision (reconciles the spec's two statements):** parameters are persisted at **sharpen** time so a reload of the confirm gate still shows the proposals; the design route (Task 5) **replaces** that set with whatever the user confirmed.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/hunch/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/memory/recall", () => ({ recallPriors: vi.fn(async () => []) }));
vi.mock("@/mastra/agents/hypothesis-coach", () => ({ sharpenHunch: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { hunch: { create: vi.fn() } },
}));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sharpenHunch } from "@/mastra/agents/hypothesis-coach";

const req = (body: unknown) =>
  new Request("http://t/api/hunch", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/hunch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
  });

  it("persists the outcome as the primary parameter plus the proposed trackers", async () => {
    vi.mocked(sharpenHunch).mockResolvedValue({
      statement: "Coffee after lunch makes me sleep worse.",
      outcomeMetric: "hours of sleep from a tracker",
      outcomeType: "continuous",
      confounders: [],
      trackers: [{ label: "stress", type: "continuous", unit: "1-10", min: 1, max: 10 }],
    });
    vi.mocked(db.hunch.create).mockResolvedValue({
      id: "h1",
      hypothesis: {},
      parameters: [],
    } as never);

    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
    expect(res.status).toBe(201);

    const arg = vi.mocked(db.hunch.create).mock.calls[0][0] as {
      data: { parameters: { create: { label: string; isPrimary: boolean; sortOrder: number }[] } };
      include: { parameters: unknown };
    };
    const created = arg.data.parameters.create;
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      label: "hours of sleep from a tracker",
      isPrimary: true,
      sortOrder: 0,
    });
    expect(created[1]).toMatchObject({ label: "stress", isPrimary: false, sortOrder: 1 });
    expect(arg.include.parameters).toBeTruthy();
  });

  it("502s when the coach throws", async () => {
    vi.mocked(sharpenHunch).mockRejectedValue(new Error("bedrock down"));
    const res = await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/hunch/route.test.ts`
Expected: FAIL — `expected undefined to have length 2` (the route does not create parameters yet).

- [ ] **Step 3: Add the tracker rule to the Coach**

In `src/mastra/agents/hypothesis-coach.ts`, add this bullet to `instructions` immediately after the `confounders:` bullet:

```
- trackers: 0-4 OTHER things the person could log daily that help interpret the
  result — the symptoms or co-variables around the outcome (e.g. caffeine after
  2pm, stress, exercise, screen time). Each is { label, type, unit?, min?, max? }.
  Use "binary" for yes/no logs and "continuous" for numbers or scales; for a
  rating scale set unit (e.g. "1-10") plus min and max. Never repeat the
  outcomeMetric as a tracker. Propose none rather than padding with filler.
```

- [ ] **Step 4: Persist the parameter set at sharpen time**

In `src/app/api/hunch/route.ts`, add the import:

```ts
import { draftsFromSharpened, toParameterDto } from "@/lib/parameters";
```

and replace the `db.hunch.create(...)` call with:

```ts
    const drafts = draftsFromSharpened(sharpened);

    const hunch = await db.hunch.create({
      data: {
        userId: session.user.id,
        rawText: parsed.data.rawText,
        status: "sharpened",
        hypothesis: {
          create: {
            statement: sharpened.statement,
            outcomeMetric: sharpened.outcomeMetric,
            outcomeType: sharpened.outcomeType,
            confounders: sharpened.confounders,
          },
        },
        // The proposed set the confirm gate edits. Persisted now so a reload
        // of the protocol page still shows the trackers the Coach suggested.
        parameters: {
          create: drafts.map((d, i) => ({
            label: d.label,
            type: d.type,
            unit: d.unit ?? null,
            min: d.min ?? null,
            max: d.max ?? null,
            isPrimary: d.isPrimary,
            sortOrder: i,
          })),
        },
      },
      include: { hypothesis: true, parameters: { orderBy: { sortOrder: "asc" } } },
    });
```

and the success response, so the client gets DTO-shaped parameters:

```ts
    return NextResponse.json(
      { hunch: { ...hunch, parameters: hunch.parameters.map(toParameterDto) }, priors },
      { status: 201 },
    );
```

Then teach the client hook about them — in `src/hooks/use-create-hunch.ts`:

```ts
import type { Parameter } from "@/lib/schemas/parameter";
```

```ts
/** A persisted hunch with its sharpened hypothesis + any recalled priors. */
export type HunchWithHypothesis = {
  id: string;
  rawText: string;
  status: string;
  hypothesis: SharpenedHypothesis & { id: string };
  /** The proposed parameter set the confirm gate will edit. */
  parameters: Parameter[];
  priors: Prior[];
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/app/api/hunch/route.test.ts && npm run test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/mastra/agents/hypothesis-coach.ts src/app/api/hunch/route.ts src/app/api/hunch/route.test.ts src/hooks/use-create-hunch.ts
git commit -m "feat(sharpen): coach proposes trackers, persisted as parameters"
```

---

### Task 5: Read + confirm parameters through the design route

**Files:**
- Modify: `src/app/api/hunch/[id]/route.ts`
- Modify: `src/app/api/hunch/[id]/protocol/route.ts`
- Create: `src/app/api/hunch/[id]/protocol/route.test.ts`
- Modify: `src/hooks/use-hunch-info.ts`
- Modify: `src/hooks/use-design-protocol.ts`

**Interfaces:**
- Consumes: `parameterListSchema` (Task 1), `db.parameter` (Task 2), `toParameterDto` (Task 3).
- Produces:
  - `GET /api/hunch/[id]` → `{ hypothesis: { statement, outcomeMetric, outcomeType }, parameters: Parameter[], protocol }`.
  - `POST /api/hunch/[id]/protocol` body `{ parameters: ParameterDraft[] }` → same response as before plus `parameters: Parameter[]`.
  - `HunchInfo` type gains `parameters: Parameter[]` and `hypothesis.outcomeType`.
  - `useDesignProtocol(hunchId).mutate(parameters: ParameterDraft[])`; `DesignResponse` gains `parameters: Parameter[]`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/hunch/[id]/protocol/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/mastra/workflows/design", () => ({
  designProtocol: vi.fn(),
  resolveSafetyState: vi.fn(() => "approved"),
}));
vi.mock("@/lib/db", () => {
  const tx = {
    parameter: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn(async () => []) },
    protocol: { upsert: vi.fn(async () => ({ id: "pr1", safetyState: "approved" })) },
    hunch: { update: vi.fn() },
  };
  return {
    db: {
      hunch: { findFirst: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  };
});

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { designProtocol } from "@/mastra/workflows/design";

const tx = (db as unknown as { __tx: Record<string, Record<string, ReturnType<typeof vi.fn>>> }).__tx;

const req = (body: unknown) =>
  new Request("http://t/api/hunch/h1/protocol", { method: "POST", body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: "h1" }) };

const sharpened = {
  id: "h1",
  status: "sharpened",
  hypothesis: {
    statement: "s",
    outcomeMetric: "hours of sleep",
    outcomeType: "continuous",
    confounders: [],
  },
};

describe("POST /api/hunch/[id]/protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(db.hunch.findFirst).mockResolvedValue(sharpened as never);
    vi.mocked(designProtocol).mockResolvedValue({
      design: {}, powerInfo: {}, confounders: [], safety: { state: "approved", reason: "r", routedToDoctor: false },
    } as never);
  });

  it("400s when the confirmed list has no primary", async () => {
    const res = await POST(
      req({ parameters: [{ label: "stress", type: "continuous", isPrimary: false }] }),
      params,
    );
    expect(res.status).toBe(400);
    expect(designProtocol).not.toHaveBeenCalled();
  });

  it("400s when the confirmed list is empty", async () => {
    const res = await POST(req({ parameters: [] }), params);
    expect(res.status).toBe(400);
  });

  it("replaces the parameter set inside the protocol transaction", async () => {
    const res = await POST(
      req({
        parameters: [
          { label: "hours of sleep", type: "continuous", isPrimary: true },
          { label: "stress", type: "continuous", unit: "1-10", min: 1, max: 10, isPrimary: false },
        ],
      }),
      params,
    );
    expect(res.status).toBe(201);
    expect(tx.parameter.deleteMany).toHaveBeenCalledWith({ where: { hunchId: "h1" } });
    const created = vi.mocked(tx.parameter.createMany).mock.calls[0][0] as {
      data: { label: string; isPrimary: boolean; sortOrder: number }[];
    };
    expect(created.data).toHaveLength(2);
    expect(created.data[0]).toMatchObject({ isPrimary: true, sortOrder: 0 });
    expect(created.data[1]).toMatchObject({ label: "stress", min: 1, max: 10, sortOrder: 1 });
  });

  it("409s when the hunch was never sharpened", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({ id: "h1", status: "draft" } as never);
    const res = await POST(
      req({ parameters: [{ label: "x", type: "binary", isPrimary: true }] }),
      params,
    );
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/api/hunch/[id]/protocol/route.test.ts"`
Expected: FAIL — the route ignores the body, so the 400 cases return 201 and `tx.parameter.deleteMany` was never called.

- [ ] **Step 3: Rewrite the design route**

Replace the body of `POST` in `src/app/api/hunch/[id]/protocol/route.ts` (keep the file's existing doc comment, extending it to mention parameters):

```ts
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { toParameterDto } from "@/lib/parameters";
import { parameterListSchema } from "@/lib/schemas/parameter";
import { designProtocol, resolveSafetyState } from "@/mastra/workflows/design";

/**
 * Phase 3: design a protocol for a sharpened hunch. Takes the parameter set the
 * user confirmed on the gate, replaces the proposed set with it, runs the design
 * workflow (confounders -> trial length -> ABA design -> safety review), applies
 * the safety gate, persists the Protocol, and flips the hunch to "running" only
 * when approved. Parameters and Protocol are written in one transaction — a
 * designed trial always has exactly one primary parameter.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: { hypothesis: true },
  });
  if (!hunch) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }
  if (!hunch.hypothesis || hunch.status === "draft") {
    return NextResponse.json(
      { error: "Sharpen this hunch into a hypothesis first." },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const confirmed = parameterListSchema.safeParse((body as { parameters?: unknown })?.parameters);
  if (!confirmed.success) {
    return NextResponse.json(
      { error: "Pick one main thing to measure before we design this." },
      { status: 400 },
    );
  }

  const result = await designProtocol({
    statement: hunch.hypothesis.statement,
    outcomeMetric: hunch.hypothesis.outcomeMetric,
    outcomeType: hunch.hypothesis.outcomeType as "binary" | "continuous",
    confounderNames: hunch.hypothesis.confounders,
  });

  const safetyState = resolveSafetyState(result.safety);
  const protocolData = {
    design: result.design,
    powerInfo: result.powerInfo,
    confounders: result.confounders,
    safetyState,
    startedAt: safetyState === "approved" ? new Date() : null,
  };

  const { protocol, parameters } = await db.$transaction(async (tx) => {
    // Replace, not merge: the confirmed list is the whole truth for this hunch.
    await tx.parameter.deleteMany({ where: { hunchId: hunch.id } });
    await tx.parameter.createMany({
      data: confirmed.data.map((p, i) => ({
        hunchId: hunch.id,
        label: p.label,
        type: p.type,
        unit: p.unit ?? null,
        min: p.min ?? null,
        max: p.max ?? null,
        isPrimary: p.isPrimary,
        sortOrder: i,
      })),
    });

    const saved = await tx.protocol.upsert({
      where: { hunchId: hunch.id },
      create: { hunchId: hunch.id, ...protocolData },
      update: protocolData,
    });

    if (safetyState === "approved") {
      await tx.hunch.update({ where: { id: hunch.id }, data: { status: "running" } });
    }

    const rows = await tx.parameter.findMany({
      where: { hunchId: hunch.id },
      orderBy: { sortOrder: "asc" },
    });
    return { protocol: saved, parameters: rows };
  });

  return NextResponse.json(
    {
      protocol,
      parameters: parameters.map(toParameterDto),
      safety: result.safety,
      hypothesis: {
        statement: hunch.hypothesis.statement,
        outcomeMetric: hunch.hypothesis.outcomeMetric,
      },
    },
    { status: 201 },
  );
}
```

Note: deleting parameters cascades to their `CheckInValue` rows. That is intentional and safe — this route only runs before a trial starts (the gate is unreachable once `approved`), so there are no readings to lose.

- [ ] **Step 4: Return parameters from the read route**

In `src/app/api/hunch/[id]/route.ts`, add the import `import { toParameterDto } from "@/lib/parameters";`, then `parameters` to the include and the response:

```ts
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: {
      hypothesis: true,
      protocol: true,
      parameters: { orderBy: { sortOrder: "asc" } },
    },
  });
```

```ts
  return NextResponse.json({
    hypothesis: {
      statement: hunch.hypothesis.statement,
      outcomeMetric: hunch.hypothesis.outcomeMetric,
      // The gate needs this to seed a primary row for pre-migration hunches.
      outcomeType: hunch.hypothesis.outcomeType,
    },
    parameters: hunch.parameters.map(toParameterDto),
    protocol: p
      ? {
          id: p.id,
          safetyState: p.safetyState,
          design: p.design,
          powerInfo: p.powerInfo,
          confounders: p.confounders,
        }
      : null,
  });
```

- [ ] **Step 5: Update the two hooks**

In `src/hooks/use-hunch-info.ts`:

```ts
import type { Parameter } from "@/lib/schemas/parameter";
```

```ts
export type HunchInfo = {
  hypothesis: { statement: string; outcomeMetric: string; outcomeType: "binary" | "continuous" };
  /** The parameters logged daily. Exactly one is primary once designed. */
  parameters: Parameter[];
  protocol: null | {
    id: string;
    safetyState: "approved" | "refused" | "pending";
    design: ProtocolDesign;
    powerInfo: PowerInfo;
    confounders: Confounder[];
  };
};
```

In `src/hooks/use-design-protocol.ts`:

```ts
import type { ParameterDraft, Parameter } from "@/lib/schemas/parameter";
```

```ts
export type DesignResponse = {
  protocol: {
    id: string;
    safetyState: "approved" | "refused" | "pending";
    design: ProtocolDesign;
    powerInfo: PowerInfo;
    confounders: Confounder[];
  };
  /** The parameter set as persisted from the user's confirmation. */
  parameters: Parameter[];
  safety: SafetyVerdict;
  /** The sharpened hypothesis this protocol tests — for the plan's header. */
  hypothesis: { statement: string; outcomeMetric: string };
};

async function postDesign(
  hunchId: string,
  parameters: ParameterDraft[],
): Promise<DesignResponse> {
  const res = await fetch(`/api/hunch/${hunchId}/protocol`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parameters }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? "Something went wrong designing your protocol.");
  }
  return body as DesignResponse;
}

/** Design (or redesign) the protocol for a sharpened hunch. */
export function useDesignProtocol(hunchId: string) {
  return useMutation({
    mutationFn: (parameters: ParameterDraft[]) => postDesign(hunchId, parameters),
  });
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run "src/app/api/hunch/[id]/protocol/route.test.ts"`
Expected: PASS (4 tests).

`npm run typecheck` still fails here — `protocol/page.tsx` calls `design.mutate()` with no argument, and the check-in/belief/verdict routes still read `CheckIn.value`. Tasks 6 and 7 clear those. Do not patch them here.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/hunch/[id]/route.ts" "src/app/api/hunch/[id]/protocol/route.ts" "src/app/api/hunch/[id]/protocol/route.test.ts" src/hooks/use-hunch-info.ts src/hooks/use-design-protocol.ts
git commit -m "feat(api): confirm parameters when designing the protocol"
```

---

### Task 6: Multi-value check-in and primary-only reads

**Files:**
- Modify: `src/app/api/hunch/[id]/checkin/route.ts`
- Create: `src/app/api/hunch/[id]/checkin/route.test.ts`
- Modify: `src/app/api/hunch/[id]/belief/route.ts`
- Modify: `src/app/api/hunch/[id]/verdict/route.ts`
- Modify: `src/lib/home.ts`
- Modify: `src/lib/schemas/belief.ts`
- Modify: `src/lib/schemas/belief.test.ts`
- Modify: `src/hooks/use-checkin.ts`
- Modify: `src/hooks/use-belief.ts`

**Interfaces:**
- Consumes: `checkInValuesInputSchema`, `validateParameterValue` (Task 1); `db.checkInValue`, `db.parameter` (Task 2); `primaryBeliefRows`, `pickPrimary` (Task 3).
- Produces:
  - `POST /api/hunch/[id]/checkin` body `{ values: [{ parameterId, value }] }` → `{ checkIn: { id, phase }, belief }`.
  - `GET /api/hunch/[id]/belief` → `{ belief, parameters: Parameter[], checkIns: { phase, loggedAt, values: { parameterId, value }[] }[], schedule }`.
  - `HomeHunch` gains `primaryParameter: { id: string; label: string; type: "binary" | "continuous"; min: number | null; max: number | null } | null`.
  - `useCheckIn(hunchId).mutate(values: { parameterId: string; value: number }[])`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/hunch/[id]/checkin/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/db", () => ({
  db: {
    hunch: { findFirst: vi.fn() },
    checkIn: { upsert: vi.fn(async () => ({ id: "c1", phase: "A" })), findMany: vi.fn(async () => []) },
    checkInValue: { upsert: vi.fn() },
  },
}));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const req = (body: unknown) =>
  new Request("http://t/api/hunch/h1/checkin", { method: "POST", body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: "h1" }) };

// A running trial whose schedule puts today inside phase A.
const running = {
  id: "h1",
  status: "running",
  hypothesis: { outcomeType: "continuous" },
  protocol: {
    startedAt: new Date(),
    safetyState: "approved",
    design: {
      phases: [
        { label: "A", kind: "baseline", days: 7, name: "Baseline", action: "log it" },
        { label: "B", kind: "intervention", days: 7, name: "Change", action: "do it" },
      ],
      washoutDays: 0,
      controls: [],
      instructions: "log daily",
    },
  },
  parameters: [
    { id: "p1", label: "hours of sleep", type: "continuous", min: null, max: null, isPrimary: true },
    { id: "p2", label: "stress", type: "continuous", min: 1, max: 10, isPrimary: false },
  ],
};

describe("POST /api/hunch/[id]/checkin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(db.hunch.findFirst).mockResolvedValue(running as never);
  });

  it("writes one CheckInValue per submitted parameter", async () => {
    const res = await POST(
      req({ values: [{ parameterId: "p1", value: 7.5 }, { parameterId: "p2", value: 4 }] }),
      params,
    );
    expect(res.status).toBe(201);
    expect(db.checkInValue.upsert).toHaveBeenCalledTimes(2);
  });

  it("accepts a partial payload", async () => {
    const res = await POST(req({ values: [{ parameterId: "p2", value: 4 }] }), params);
    expect(res.status).toBe(201);
    expect(db.checkInValue.upsert).toHaveBeenCalledTimes(1);
  });

  it("400s on a value outside a parameter's bounds and writes nothing", async () => {
    const res = await POST(req({ values: [{ parameterId: "p2", value: 99 }] }), params);
    expect(res.status).toBe(400);
    expect(db.checkInValue.upsert).not.toHaveBeenCalled();
  });

  it("400s on a parameter that does not belong to this hunch", async () => {
    const res = await POST(req({ values: [{ parameterId: "nope", value: 1 }] }), params);
    expect(res.status).toBe(400);
    expect(db.checkInValue.upsert).not.toHaveBeenCalled();
  });

  it("400s on an empty payload", async () => {
    const res = await POST(req({ values: [] }), params);
    expect(res.status).toBe(400);
  });

  it("409s when the trial is not running", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({ ...running, status: "sharpened" } as never);
    const res = await POST(req({ values: [{ parameterId: "p1", value: 7 }] }), params);
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/api/hunch/[id]/checkin/route.test.ts"`
Expected: FAIL — the route parses `{ value }` and 400s on every one of these payloads.

- [ ] **Step 3: Rewrite the check-in route**

Replace `src/app/api/hunch/[id]/checkin/route.ts` with:

```ts
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { computeBelief } from "@/lib/bayes";
import { pickPrimary, primaryBeliefRows } from "@/lib/parameters";
import { currentPhase } from "@/lib/schedule";
import { checkInValuesInputSchema, validateParameterValue } from "@/lib/schemas/parameter";
import type { ParameterType } from "@/lib/schemas/parameter";
import { parseStoredDesign } from "@/lib/schemas/protocol";

/** UTC calendar date (midnight) for today — the per-day check-in bucket. */
function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Phase 4: log today's readings. The server derives the phase from the schedule
 * (never trusts the client), refuses washout / pre-start / post-end days, and
 * upserts one CheckIn bucket per UTC day with one CheckInValue per parameter the
 * client sent. Partial payloads are fine; every value is validated against its
 * own parameter before anything is written. Returns the recomputed belief (from
 * the primary parameter only) so the meter narrows immediately.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: { hypothesis: true, protocol: true, parameters: true },
  });
  if (!hunch || !hunch.hypothesis) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }
  if (hunch.status !== "running" || !hunch.protocol?.startedAt || hunch.protocol.safetyState !== "approved") {
    return NextResponse.json({ error: "This hunch is not running yet." }, { status: 409 });
  }

  const parsed = checkInValuesInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "A check-in needs at least one reading." }, { status: 400 });
  }

  // Validate everything before writing anything — a rejected day writes no rows.
  const byId = new Map(hunch.parameters.map((p) => [p.id, p]));
  for (const row of parsed.data.values) {
    const param = byId.get(row.parameterId);
    if (!param) {
      return NextResponse.json({ error: "That isn't something this hunch tracks." }, { status: 400 });
    }
    const problem = validateParameterValue(
      { label: param.label, type: param.type as ParameterType, min: param.min, max: param.max },
      row.value,
    );
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }
  }

  const design = parseStoredDesign(hunch.protocol.design, hunch.hypothesis.outcomeMetric);
  const status = currentPhase(hunch.protocol.startedAt, design, new Date());
  if (status.done) {
    return NextResponse.json({ error: "This trial is complete." }, { status: 409 });
  }
  if (status.washout || status.phase === null) {
    return NextResponse.json({ error: "Today is a rest day — nothing to log." }, { status: 409 });
  }

  const loggedOn = utcToday();
  const checkIn = await db.checkIn.upsert({
    where: { hunchId_loggedOn: { hunchId: hunch.id, loggedOn } },
    create: { hunchId: hunch.id, phase: status.phase, loggedOn },
    update: { phase: status.phase },
  });

  // Re-tapping a parameter overwrites today's reading for it; parameters the
  // user left blank keep whatever they already had.
  for (const row of parsed.data.values) {
    await db.checkInValue.upsert({
      where: { checkInId_parameterId: { checkInId: checkIn.id, parameterId: row.parameterId } },
      create: { checkInId: checkIn.id, parameterId: row.parameterId, value: row.value },
      update: { value: row.value },
    });
  }

  const all = await db.checkIn.findMany({
    where: { hunchId: hunch.id },
    select: { phase: true, values: { select: { parameterId: true, value: true } } },
  });
  const primary = pickPrimary(hunch.parameters);
  const belief = computeBelief(
    primaryBeliefRows(all, primary?.id),
    (primary?.type ?? hunch.hypothesis.outcomeType) as "binary" | "continuous",
  );

  return NextResponse.json({ checkIn, belief }, { status: 201 });
}
```

- [ ] **Step 4: Run the check-in test to verify it passes**

Run: `npx vitest run "src/app/api/hunch/[id]/checkin/route.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 5: Point the belief route at the primary parameter**

In `src/app/api/hunch/[id]/belief/route.ts`, add imports:

```ts
import { pickPrimary, primaryBeliefRows, toParameterDto } from "@/lib/parameters";
```

then replace the query and the belief computation:

```ts
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: {
      hypothesis: true,
      protocol: true,
      parameters: { orderBy: { sortOrder: "asc" } },
      checkIns: {
        orderBy: { loggedAt: "asc" },
        include: { values: { select: { parameterId: true, value: true } } },
      },
    },
  });
```

```ts
  const primary = pickPrimary(hunch.parameters);
  const outcomeType = (primary?.type ?? hunch.hypothesis.outcomeType) as "binary" | "continuous";
  const belief = computeBelief(primaryBeliefRows(hunch.checkIns, primary?.id), outcomeType);
```

and the response's `checkIns` projection:

```ts
  return NextResponse.json({
    belief,
    parameters: hunch.parameters.map(toParameterDto),
    checkIns: hunch.checkIns.map((c) => ({
      phase: c.phase,
      loggedAt: c.loggedAt,
      values: c.values.map((v) => ({ parameterId: v.parameterId, value: v.value })),
    })),
    schedule,
  });
```

In `src/hooks/use-belief.ts`, update the response type:

```ts
import type { Parameter } from "@/lib/schemas/parameter";

export type BeliefResponse = {
  belief: Belief;
  /** Everything logged daily; exactly one is primary. */
  parameters: Parameter[];
  checkIns: { phase: string; loggedAt: string; values: { parameterId: string; value: number }[] }[];
  schedule: PhaseStatus | null;
};
```

- [ ] **Step 6: Point the verdict route at the primary parameter**

In `src/app/api/hunch/[id]/verdict/route.ts`, add the same import, extend the include with `parameters: true` and `checkIns: { orderBy: { loggedAt: "asc" }, include: { values: { select: { parameterId: true, value: true } } } }`, then replace the belief computation:

```ts
  const primary = pickPrimary(hunch.parameters);
  const outcomeType = (primary?.type ?? hunch.hypothesis.outcomeType) as "binary" | "continuous";
  const belief = computeBelief(primaryBeliefRows(hunch.checkIns, primary?.id), outcomeType);
```

Everything downstream (`classifyVerdict`, `runAnalysis`, the persist transaction) is unchanged.

- [ ] **Step 7: Give home the primary parameter**

In `src/lib/home.ts`, extend the type:

```ts
export type HomeHunch = {
  id: string;
  rawText: string;
  statement: string;
  status: string;
  outcomeType: "binary" | "continuous";
  /** What the home quick-log writes to. Null before the hunch is sharpened. */
  primaryParameter: {
    id: string;
    label: string;
    type: "binary" | "continuous";
    min: number | null;
    max: number | null;
  } | null;
  phaseLabel: "baseline" | "intervention" | null;
  progress: { day: number; total: number } | null;
  loggableToday: boolean;
  loggedToday: boolean;
  verdict: { category: string; effect: number; pEffect: number } | null;
};
```

add `parameters: true` to the `include`, add the import `import { pickPrimary } from "@/lib/parameters";`, and inside `mapped` compute and return it:

```ts
    const primary = pickPrimary(h.parameters);
```

```ts
      primaryParameter: primary
        ? {
            id: primary.id,
            label: primary.label,
            type: primary.type as "binary" | "continuous",
            min: primary.min,
            max: primary.max,
          }
        : null,
```

- [ ] **Step 8: Retire the single-value check-in schema**

In `src/lib/schemas/belief.ts`, delete `checkInInputSchema` and its `CheckInInput` type (the file keeps `beliefSchema` / `Belief`). In `src/lib/schemas/belief.test.ts`, delete the `describe("checkInInputSchema", ...)` block and the now-unused import.

In `src/hooks/use-checkin.ts`:

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Belief } from "@/lib/schemas/belief";

/** One reading the user is submitting for one parameter. */
export type CheckInValueInput = { parameterId: string; value: number };

export type CheckInResponse = {
  checkIn: { id: string; phase: string };
  belief: Belief;
};

async function postCheckIn(
  hunchId: string,
  values: CheckInValueInput[],
): Promise<CheckInResponse> {
  const res = await fetch(`/api/hunch/${hunchId}/checkin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? "Could not log your check-in.");
  }
  return body as CheckInResponse;
}

/** Log today's readings; refreshes the belief meter on success. */
export function useCheckIn(hunchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: CheckInValueInput[]) => postCheckIn(hunchId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["belief", hunchId] });
    },
  });
}
```

- [ ] **Step 9: Run the full suite**

Run: `npm run test`
Expected: PASS. `npm run typecheck` still reports errors in `checkin-tap.tsx`, `home-view.tsx`, `hunch/[id]/page.tsx`, and `protocol/page.tsx` — those are Tasks 7 and 8.

- [ ] **Step 10: Commit**

```bash
git add "src/app/api/hunch/[id]/checkin" "src/app/api/hunch/[id]/belief/route.ts" "src/app/api/hunch/[id]/verdict/route.ts" src/lib/home.ts src/lib/schemas/belief.ts src/lib/schemas/belief.test.ts src/hooks/use-checkin.ts src/hooks/use-belief.ts
git commit -m "feat(api): log many parameters a day, verdict reads the primary"
```

---

### Task 7: Confirm-gate parameter editor

**Files:**
- Create: `src/components/hunch/parameter-editor.tsx`
- Modify: `src/app/hunch/[id]/protocol/page.tsx`
- Modify: `src/components/hunch/new-hunch-form.tsx`

**Interfaces:**
- Consumes: `ParameterDraft`, `parameterListSchema` (Task 1); `draftsFromSharpened` (Task 3); `HunchInfo.parameters`, `useDesignProtocol(...).mutate(parameters)` (Task 5).
- Produces: `<ParameterEditor value={ParameterDraft[]} onChange={(next: ParameterDraft[]) => void} />` — a controlled list editor.

- [ ] **Step 1: Build the editor**

Create `src/components/hunch/parameter-editor.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { ParameterDraft } from "@/lib/schemas/parameter";

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

const mono = "'Space Mono',monospace";

const field: React.CSSProperties = {
  padding: "9px 11px",
  background: "color-mix(in srgb,var(--paper) 82%,var(--ink))",
  border: "1px solid var(--rule)",
  borderRadius: 9,
  color: "var(--ink)",
  fontFamily: mono,
  fontSize: 12.5,
  outline: "none",
  minWidth: 0,
};

const ghostBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: mono,
  fontSize: 11.5,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--muted)",
  padding: 0,
};

/** One editable row: label, number/yes-no toggle, and (for numbers) unit + bounds. */
function Row({
  row,
  onChange,
  onRemove,
}: {
  row: ParameterDraft;
  onChange: (next: ParameterDraft) => void;
  onRemove: (() => void) | null;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--rule)",
        borderLeft: row.isPrimary ? "2px solid var(--s1)" : "1px solid var(--rule)",
        borderRadius: 11,
        padding: "12px 13px",
        display: "grid",
        gap: 9,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...label, color: row.isPrimary ? "var(--s1)" : "var(--muted)" }}>
          {row.isPrimary ? "main measure" : "also tracking"}
        </span>
        {onRemove && (
          <button type="button" onClick={onRemove} style={{ ...ghostBtn, marginLeft: "auto" }}>
            remove
          </button>
        )}
      </div>

      <input
        value={row.label}
        onChange={(e) => onChange({ ...row, label: e.target.value })}
        placeholder="what you'll log"
        aria-label={row.isPrimary ? "Main measure" : "Tracker"}
        style={{ ...field, width: "100%" }}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          onClick={() =>
            onChange(
              row.type === "binary"
                ? { ...row, type: "continuous" }
                : { ...row, type: "binary", unit: undefined, min: undefined, max: undefined },
            )
          }
          style={{
            ...field,
            cursor: "pointer",
            borderColor: "var(--rule)",
            background: "transparent",
          }}
        >
          {row.type === "binary" ? "yes / no" : "a number"}
        </button>

        {row.type === "continuous" && (
          <>
            <input
              value={row.unit ?? ""}
              onChange={(e) => onChange({ ...row, unit: e.target.value || undefined })}
              placeholder="unit"
              aria-label="Unit"
              style={{ ...field, width: 88 }}
            />
            <input
              type="number"
              step="any"
              value={row.min ?? ""}
              onChange={(e) =>
                onChange({ ...row, min: e.target.value === "" ? undefined : Number(e.target.value) })
              }
              placeholder="min"
              aria-label="Lowest value"
              style={{ ...field, width: 76 }}
            />
            <input
              type="number"
              step="any"
              value={row.max ?? ""}
              onChange={(e) =>
                onChange({ ...row, max: e.target.value === "" ? undefined : Number(e.target.value) })
              }
              placeholder="max"
              aria-label="Highest value"
              style={{ ...field, width: 76 }}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * The confirm gate's parameter list: the primary measure (always shown, never
 * removable) plus the trackers the Coach proposed, all editable. Trackers live
 * behind a disclosure so the default view stays about the hypothesis.
 */
export function ParameterEditor({
  value,
  onChange,
}: {
  value: ParameterDraft[];
  onChange: (next: ParameterDraft[]) => void;
}) {
  const primaryIndex = value.findIndex((p) => p.isPrimary);
  const trackers = value.filter((p) => !p.isPrimary);
  const [open, setOpen] = useState(trackers.length > 0);

  const replaceAt = (i: number, next: ParameterDraft) =>
    onChange(value.map((row, j) => (j === i ? next : row)));

  return (
    <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
      {primaryIndex >= 0 && (
        <Row
          row={value[primaryIndex]}
          onChange={(next) => replaceAt(primaryIndex, next)}
          onRemove={null}
        />
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ ...ghostBtn, justifySelf: "start", color: "var(--s1)" }}
      >
        {open ? "− things to track" : `＋ things to track${trackers.length ? ` (${trackers.length})` : ""}`}
      </button>

      {open && (
        <div style={{ display: "grid", gap: 10 }}>
          {trackers.length === 0 && (
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: "var(--muted)" }}>
              Add anything else you want to log next to it — it won&apos;t change the verdict, it
              just helps you read the result.
            </p>
          )}

          {value.map((row, i) =>
            row.isPrimary ? null : (
              <Row
                key={i}
                row={row}
                onChange={(next) => replaceAt(i, next)}
                onRemove={() => onChange(value.filter((_, j) => j !== i))}
              />
            ),
          )}

          {value.length < 5 && (
            <button
              type="button"
              onClick={() =>
                onChange([...value, { label: "", type: "continuous", isPrimary: false }])
              }
              style={{ ...ghostBtn, justifySelf: "start" }}
            >
              ＋ add another
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the confirm gate**

In `src/app/hunch/[id]/protocol/page.tsx`:

Add imports:

```tsx
import { useEffect, useState, use } from "react";
import { ParameterEditor } from "@/components/hunch/parameter-editor";
import { draftsFromSharpened } from "@/lib/parameters";
import { parameterListSchema, type ParameterDraft } from "@/lib/schemas/parameter";
```

Inside the component, after `const design = useDesignProtocol(id);`, add the draft state seeded from the server's parameter set (falling back to the hypothesis when a legacy hunch has none):

```tsx
  const [drafts, setDrafts] = useState<ParameterDraft[] | null>(null);

  // Seed the editable list once the read lands: the persisted parameters if the
  // sharpen step wrote them, otherwise just the outcome as the primary.
  useEffect(() => {
    if (drafts !== null || !info.data) return;
    const stored = info.data.parameters;
    setDrafts(
      stored.length > 0
        ? stored.map((p) => ({
            label: p.label,
            type: p.type,
            unit: p.unit,
            min: p.min,
            max: p.max,
            isPrimary: p.isPrimary,
          }))
        : draftsFromSharpened({
            outcomeMetric: info.data.hypothesis.outcomeMetric,
            outcomeType: info.data.hypothesis.outcomeType,
          }),
    );
  }, [info.data, drafts]);

  const cleaned = (drafts ?? []).filter((d) => d.label.trim() !== "");
  const canDesign = parameterListSchema.safeParse(cleaned).success;
```

Replace the hypothesis card's "Measured by" line and the button block inside the confirm gate:

```tsx
                <p style={{ margin: "10px 0 0", fontFamily: mono, fontSize: 11.5, color: "var(--muted)", overflowWrap: "anywhere" }}>
                  You&apos;ll log this daily — edit anything that&apos;s off.
                </p>
              </div>

              {drafts && <ParameterEditor value={drafts} onChange={setDrafts} />}

              <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
                <Link href="/hunch/new" style={{ ...gateBtn, flex: 1, border: "1px solid var(--ink)", background: "transparent", color: "var(--ink)", textDecoration: "none" }}>
                  ↻ redo
                </Link>
                <button
                  type="button"
                  disabled={!canDesign}
                  onClick={() => design.mutate(cleaned)}
                  style={{
                    ...gateBtn,
                    flex: 1,
                    border: "1px solid var(--s1)",
                    background: canDesign ? "var(--s1)" : "transparent",
                    color: canDesign ? "var(--paper)" : "var(--muted)",
                    cursor: canDesign ? "pointer" : "not-allowed",
                  }}
                >
                  Looks right — design it →
                </button>
              </div>
```

Also fix the retry button inside the `design.isError` block — it must resend the same list:

```tsx
                onClick={() => design.mutate(cleaned)}
```

- [ ] **Step 3: Seed the cache with parameters on handoff**

In `src/components/hunch/new-hunch-form.tsx`, the sharpen response now carries `parameters`; include them in the seeded cache entry so the gate renders instantly:

```tsx
    queryClient.setQueryData<HunchInfo>(["hunch-info", hunch.id], {
      hypothesis: {
        statement: hunch.hypothesis.statement,
        outcomeMetric: hunch.hypothesis.outcomeMetric,
      },
      parameters: hunch.parameters ?? [],
      protocol: null,
    });
```

`HunchWithHypothesis` already carries `parameters` from Task 4, so `hunch.parameters` typechecks here; the `?? []` guard only covers a server that answered without them.

- [ ] **Step 4: Typecheck and run the suite**

Run: `npm run typecheck && npm run test`
Expected: the only remaining type errors are in `checkin-tap.tsx`, `home-view.tsx`, and `hunch/[id]/page.tsx` (Task 8). All tests pass.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, then create a hunch at `http://localhost:3000/hunch/new` and land on the protocol page.
Expected: the confirm gate shows the hypothesis card, the main-measure row prefilled from the outcome metric, and a "＋ things to track" disclosure holding the Coach's trackers. Toggle a row between "a number" and "yes / no", add a row, remove one, clear the main measure's label (the design button greys out), then design. Reload the page before designing — the rows survive.

- [ ] **Step 6: Commit**

```bash
git add src/components/hunch/parameter-editor.tsx "src/app/hunch/[id]/protocol/page.tsx" src/components/hunch/new-hunch-form.tsx
git commit -m "feat(protocol): confirm what you'll track before designing"
```

---

### Task 8: Log every parameter daily

**Files:**
- Modify: `src/components/checkin-tap.tsx`
- Modify: `src/app/hunch/[id]/page.tsx`
- Modify: `src/components/app/home-view.tsx`

**Interfaces:**
- Consumes: `BeliefResponse.parameters` (Task 6), `useCheckIn(...).mutate(values)` (Task 6), `validateParameterValue` (Task 1), `HomeHunch.primaryParameter` (Task 6).
- Produces: `<CheckInTap hunchId schedule parameters phaseAction? />` — the `outcomeType` and `outcomeMetric` props are gone; the parameter set carries both.

- [ ] **Step 1: Rewrite the check-in card**

In `src/components/checkin-tap.tsx`, replace the props and the body between the schedule guards and the success/error footer. Keep the existing `label`, `rest`, and `btnBase` style constants:

```tsx
"use client";

import { useState } from "react";
import { useCheckIn, type CheckInValueInput } from "@/hooks/use-checkin";
import type { PhaseStatus } from "@/lib/schedule";
import { validateParameterValue, type Parameter } from "@/lib/schemas/parameter";

/* label / rest / btnBase unchanged */

const input: React.CSSProperties = {
  width: 128,
  padding: "12px 14px",
  background: "color-mix(in srgb,var(--paper) 82%,var(--ink))",
  border: "1px solid var(--rule)",
  borderRadius: 9,
  color: "var(--ink)",
  fontFamily: "'Space Mono',monospace",
  fontSize: 14,
  outline: "none",
};

/**
 * The daily log. One input per parameter — the primary first and emphasized,
 * trackers under it — submitted together. The phase comes from the schedule (the
 * user never picks it). Blank rows are simply not sent, so partial days are fine.
 * Washout, pre-start, and finished trials show a non-logging message. Brand system.
 */
export function CheckInTap({
  hunchId,
  schedule,
  parameters,
  phaseAction,
}: {
  hunchId: string;
  schedule: PhaseStatus | null;
  /** Everything this hunch tracks; exactly one is primary. */
  parameters: Parameter[];
  /** Today's phase instruction from the protocol, if available. */
  phaseAction?: string;
}) {
  const checkIn = useCheckIn(hunchId);
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

  if (!schedule || !schedule.started) {
    return <p style={rest}>Your trial hasn&apos;t started yet.</p>;
  }
  if (schedule.done) {
    return <p style={rest}>Trial complete — your verdict is coming soon.</p>;
  }
  if (schedule.washout || schedule.phase === null) {
    return <p style={rest}>Rest day — nothing to log today.</p>;
  }
  if (parameters.length === 0) {
    return <p style={rest}>Nothing to log — this hunch has no measures yet.</p>;
  }

  const phaseLabel = schedule.kind === "intervention" ? "intervention" : "baseline";
  const disabled = checkIn.isPending;
  const ordered = [...parameters].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder,
  );

  function set(id: string, raw: string) {
    setEntries((prev) => ({ ...prev, [id]: raw }));
    setProblem(null);
  }

  function submit() {
    const values: CheckInValueInput[] = [];
    for (const p of ordered) {
      const raw = entries[p.id];
      if (raw === undefined || raw.trim() === "") continue;
      const n = Number(raw);
      const bad = validateParameterValue(p, n);
      if (bad) {
        setProblem(bad);
        return;
      }
      values.push({ parameterId: p.id, value: n });
    }
    if (values.length === 0) {
      setProblem("Log at least one thing before you save.");
      return;
    }
    setProblem(null);
    checkIn.mutate(values);
  }

  return (
    <section
      style={{
        background: "color-mix(in srgb,var(--paper) 90%,var(--ink))",
        border: "1px solid var(--rule)",
        padding: "clamp(20px,2.4vw,28px)",
        minWidth: 0,
        maxWidth: "100%",
      }}
    >
      <p style={label}>
        Log today · Phase {schedule.phase}{" "}
        <span style={{ textTransform: "none", letterSpacing: "0.04em" }}>({phaseLabel})</span>
      </p>

      {phaseAction && (
        <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.55, color: "var(--muted)", overflowWrap: "anywhere" }}>
          {phaseAction}
        </p>
      )}

      <form
        style={{ marginTop: 18, display: "grid", gap: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {ordered.map((p) => (
          <div key={p.id} style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <div
              style={{
                fontFamily: p.isPrimary ? "'Clash Display',sans-serif" : "inherit",
                fontWeight: p.isPrimary ? 600 : 400,
                fontSize: p.isPrimary ? "clamp(16px,2vw,19px)" : 13.5,
                lineHeight: 1.3,
                color: p.isPrimary ? "var(--ink)" : "var(--muted)",
                overflowWrap: "anywhere",
              }}
            >
              {p.label}
              {p.unit ? (
                <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 12, color: "var(--muted)" }}>
                  {" "}
                  ({p.unit})
                </span>
              ) : null}
            </div>

            {p.type === "binary" ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  { text: "Yes", v: "1" },
                  { text: "No", v: "0" },
                ].map((opt) => {
                  const active = entries[p.id] === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => set(p.id, opt.v)}
                      disabled={disabled}
                      style={{
                        ...btnBase,
                        borderRadius: 9,
                        border: "1px solid var(--ink)",
                        background: active ? "var(--ink)" : "transparent",
                        color: active ? "var(--paper)" : "var(--ink)",
                        opacity: disabled ? 0.5 : 1,
                      }}
                    >
                      {opt.text}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                type="number"
                step="any"
                min={p.min ?? undefined}
                max={p.max ?? undefined}
                aria-label={p.label}
                value={entries[p.id] ?? ""}
                onChange={(e) => set(p.id, e.target.value)}
                placeholder={p.min != null && p.max != null ? `${p.min}–${p.max}` : "reading"}
                style={input}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--s1)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--rule)")}
              />
            )}
          </div>
        ))}

        <button
          type="submit"
          disabled={disabled}
          style={{
            ...btnBase,
            justifySelf: "start",
            borderRadius: 9,
            border: "1px solid var(--ink)",
            background: "var(--ink)",
            color: "var(--paper)",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          Log today
        </button>
      </form>

      {problem && (
        <p role="alert" style={{ margin: "14px 0 0", fontSize: 13, color: "var(--s1)" }}>{problem}</p>
      )}
      {checkIn.isSuccess && !problem && (
        <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--muted)" }}>
          Logged ✓ — log again to change today&apos;s entry.
        </p>
      )}
      {checkIn.isError && (
        <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--s1)" }}>{checkIn.error.message}</p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Update the dashboard page**

In `src/app/hunch/[id]/page.tsx`, the parameters now come from the belief response, so the `useHunchInfo` call is only still needed for the phase instruction. Replace the `content()` body's derived values and the `CheckInTap` call:

```tsx
    const { belief, schedule, parameters } = query.data;
    const concluded = schedule?.done ?? false;

    // Today's instruction: the design phase matching the phase we're logging.
    const phaseAction = info.data?.protocol?.design.phases.find(
      (p) => p.label === schedule?.phase,
    )?.action;

    return concluded ? (
      <VerdictView hunchId={id} />
    ) : (
      <div style={{ display: "grid", gap: 20 }}>
        <BeliefMeter belief={belief} />
        <CheckInTap
          hunchId={id}
          schedule={schedule}
          parameters={parameters}
          phaseAction={phaseAction}
        />
      </div>
    );
```

Delete the now-unused `outcomeType` and `outcomeMetric` locals.

- [ ] **Step 3: Update the home quick-log**

In `src/components/app/home-view.tsx`, `CheckinRow` must send `{ parameterId, value }[]`. Inside `CheckinRow`, add at the top:

```tsx
  const primary = h.primaryParameter;
```

Guard the whole logging block on it — if a hunch somehow has no primary, show the statement without a tap:

```tsx
      {done ? (
        <div style={{ marginTop: 16, fontSize: 13, color: "var(--s2)" }}>
          Logged ✓ — see you tomorrow.
        </div>
      ) : !primary ? null : (
```

Change the copy line under "How did today go?" to name the measure:

```tsx
            {primary.label}
```

and the three mutation calls:

```tsx
                onClick={() => checkIn.mutate([{ parameterId: primary.id, value: 1 }])}
```

```tsx
                onClick={() => checkIn.mutate([{ parameterId: primary.id, value: 0 }])}
```

```tsx
                if (num.trim() !== "" && Number.isFinite(n))
                  checkIn.mutate([{ parameterId: primary.id, value: n }]);
```

Also swap the binary/number branch condition from `h.outcomeType === "binary"` to `primary.type === "binary"`, the input's `aria-label="Today's reading"` to `aria-label={primary.label}`, and add `min={primary.min ?? undefined} max={primary.max ?? undefined}`.

The home card's deep-link to the full dashboard stays as-is — trackers are logged there.

- [ ] **Step 4: Typecheck and run the suite**

Run: `npm run typecheck && npm run test`
Expected: no TypeScript errors anywhere, all tests pass.

- [ ] **Step 5: Verify the whole loop in the browser**

Run: `npm run dev` (restart it if the Prisma client was regenerated since it started).

1. `/hunch/new` → sharpen → confirm gate shows the parameter list → design.
2. On `/hunch/<id>`: every confirmed parameter has its own labelled input, primary on top; a bounded scale rejects an out-of-range number with its own message.
3. Log a partial day (fill only a tracker) — it saves; the belief meter does not move (no primary reading).
4. Log the primary — the meter moves.
5. Re-log the same day with different numbers — values overwrite, no duplicate day.
6. `/home` quick-log writes the primary and the card flips to "Logged ✓".

Confirm in the database:

```bash
docker exec hunch-db psql -U postgres -d hunch -c \
  'SELECT p."label", p."isPrimary", v."value" FROM "CheckInValue" v
   JOIN "Parameter" p ON p."id" = v."parameterId" ORDER BY p."sortOrder";'
```

Expected: one row per logged parameter with the values you entered.

- [ ] **Step 6: Commit**

```bash
git add src/components/checkin-tap.tsx "src/app/hunch/[id]/page.tsx" src/components/app/home-view.tsx
git commit -m "feat(checkin): log every parameter in one daily submit"
```

---

## Verification (after all tasks)

- [ ] `npm run test` — full Vitest suite green (the 123 pre-existing tests plus the new files).
- [ ] `npm run typecheck` — clean.
- [ ] `npm run lint` — clean.
- [ ] `npx prisma migrate status` — no pending migrations, no drift.
- [ ] End-to-end pass from Task 8 Step 5 completed on a freshly created hunch **and** on a hunch created before the migration (the backfilled one logs exactly as before, with a single primary parameter).
