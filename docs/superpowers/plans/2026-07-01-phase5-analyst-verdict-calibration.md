# Phase 5 — Analyst Verdict + Calibration Eval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an experiment's ABA schedule ends, conclude the hunch and produce a frozen, plain-English verdict with a calibrated confidence and effect size — including "inconclusive" as a legitimate outcome — gated by a deterministic Brier calibration test.

**Architecture:** The Phase 4 Bayesian engine owns the number (`pEffect`, `effect`, `ci`). A pure `classifyVerdict` maps the belief + schedule to a category. An LLM **Analyst** narrates that category — prose only, never arithmetic. The verdict is generated once on the first read after the schedule ends, persisted as a `Verdict` snapshot, and the hunch flips to `concluded`. Calibration of the number is verified by a deterministic Brier-score test in the normal suite; the Analyst's faithfulness by a key-gated eval.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma v7 (generated client at `src/generated/prisma`), Better Auth, TanStack Query v5, zod 4.4.3, Vitest 4, Mastra (`@mastra/core`), Claude via OpenRouter.

## Global Constraints

- No new npm dependencies.
- NO `Co-Authored-By` / "Generated with Claude Code" trailers in commits. git user is "Gayatri Patil".
- Run `npx prisma generate` after any `schema.prisma` edit (the generated client at `src/generated/prisma` lags schema edits and will otherwise report new fields as missing).
- **No LLM arithmetic (RULES §3):** the Analyst never produces or alters a probability; it receives the engine's numbers and writes language only.
- The production Bayesian engine stays RNG-free. Any randomness (calibration test data) lives ONLY in the test file via a local seeded PRNG.
- Routes are thin and verified live — NO route unit tests, matching the Phase 3/4 codebase convention. Pure logic (`classifyVerdict`, schemas, calibration) IS unit-tested.
- Path alias `@/` → `src/`.
- Analyst model: `openrouter/anthropic/claude-sonnet-4.6`; cap `modelSettings.maxOutputTokens: 1024` (matches other agents).
- Verdict categories (exact strings): `helped`, `hurt`, `inconclusive_no_effect`, `inconclusive_insufficient`.

---

### Task 1: `Verdict` schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260701000000_phase5_verdict/migration.sql`

**Interfaces:**
- Produces: a `Verdict` model 1:1 with `Hunch` (cascade delete), and the `verdict` relation on `Hunch`.

- [ ] **Step 1: Add the model + relation to `prisma/schema.prisma`**

Add a `verdict Verdict?` line to the `Hunch` model's relation block (next to `protocol Protocol?`), then append this model:

```prisma
model Verdict {
  id        String   @id @default(cuid())
  hunchId   String   @unique
  category  String // helped | hurt | inconclusive_no_effect | inconclusive_insufficient
  narrative String // the Analyst's plain-English verdict
  pEffect   Float
  effect    Float
  ciLow     Float
  ciHigh    Float
  nA        Int
  nB        Int
  model     String // beta-binomial | normal-normal
  createdAt DateTime @default(now())

  hunch Hunch @relation(fields: [hunchId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2: Hand-author the migration SQL**

`prisma migrate dev` prompts interactively and is blocked in this non-TTY environment. Create `prisma/migrations/20260701000000_phase5_verdict/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "Verdict" (
    "id" TEXT NOT NULL,
    "hunchId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "pEffect" DOUBLE PRECISION NOT NULL,
    "effect" DOUBLE PRECISION NOT NULL,
    "ciLow" DOUBLE PRECISION NOT NULL,
    "ciHigh" DOUBLE PRECISION NOT NULL,
    "nA" INTEGER NOT NULL,
    "nB" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verdict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Verdict_hunchId_key" ON "Verdict"("hunchId");

-- AddForeignKey
ALTER TABLE "Verdict" ADD CONSTRAINT "Verdict_hunchId_fkey" FOREIGN KEY ("hunchId") REFERENCES "Hunch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Apply the migration + regenerate the client**

Run:
```bash
docker compose up -d db && npx prisma migrate deploy && npx prisma generate
```
Expected: "Applying migration `20260701000000_phase5_verdict`" then a clean generate. If Docker is down, `open -a Docker` and wait for the daemon first.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (the generated client now knows `db.verdict`).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260701000000_phase5_verdict/migration.sql
git commit -m "feat: add Verdict model + migration"
```

---

### Task 2: Verdict zod schemas

**Files:**
- Create: `src/lib/schemas/verdict.ts`
- Test: `src/lib/schemas/verdict.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `verdictCategorySchema` (z.enum), `type VerdictCategory`; `verdictNarrativeSchema` = `{ narrative: string }` (the Analyst's structured output); `verdictSchema` = the returned/DTO shape `{ category, narrative, pEffect, effect, ci: [number,number], nA, nB, model }`; `type Verdict`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/schemas/verdict.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  verdictCategorySchema,
  verdictNarrativeSchema,
  verdictSchema,
} from "@/lib/schemas/verdict";

describe("verdict schemas", () => {
  it("accepts the four categories and rejects others", () => {
    for (const c of ["helped", "hurt", "inconclusive_no_effect", "inconclusive_insufficient"]) {
      expect(verdictCategorySchema.safeParse(c).success).toBe(true);
    }
    expect(verdictCategorySchema.safeParse("maybe").success).toBe(false);
  });
  it("requires a non-empty narrative", () => {
    expect(verdictNarrativeSchema.safeParse({ narrative: "It helped." }).success).toBe(true);
    expect(verdictNarrativeSchema.safeParse({ narrative: "" }).success).toBe(false);
  });
  it("validates a full verdict DTO", () => {
    const dto = {
      category: "helped",
      narrative: "The intervention clearly improved your sleep.",
      pEffect: 0.97,
      effect: 1.2,
      ci: [0.4, 2.0],
      nA: 5,
      nB: 5,
      model: "normal-normal",
    };
    expect(verdictSchema.safeParse(dto).success).toBe(true);
  });
  it("rejects a pEffect outside 0..1", () => {
    const dto = {
      category: "helped", narrative: "x", pEffect: 1.4, effect: 1,
      ci: [0, 2], nA: 3, nB: 3, model: "beta-binomial",
    };
    expect(verdictSchema.safeParse(dto).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/schemas/verdict.test.ts`
Expected: FAIL — cannot resolve `@/lib/schemas/verdict`.

- [ ] **Step 3: Write the schemas**

Create `src/lib/schemas/verdict.ts`:

```ts
import { z } from "zod";

/** The five outcomes of a concluded trial; `null` (still running) is not a stored category. */
export const verdictCategorySchema = z.enum([
  "helped",
  "hurt",
  "inconclusive_no_effect",
  "inconclusive_insufficient",
]);
export type VerdictCategory = z.infer<typeof verdictCategorySchema>;

/** The Analyst's structured output — prose only. */
export const verdictNarrativeSchema = z.object({
  narrative: z.string().trim().min(1),
});

/**
 * The verdict as returned by the API and rendered by the UI. `ci` is the 95%
 * credible interval on the effect; the numbers are the frozen engine snapshot.
 */
export const verdictSchema = z.object({
  category: verdictCategorySchema,
  narrative: z.string().trim().min(1),
  pEffect: z.number().min(0).max(1),
  effect: z.number(),
  ci: z.tuple([z.number(), z.number()]),
  nA: z.number().int().min(0),
  nB: z.number().int().min(0),
  model: z.enum(["beta-binomial", "normal-normal"]),
});
export type Verdict = z.infer<typeof verdictSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/schemas/verdict.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/verdict.ts src/lib/schemas/verdict.test.ts
git commit -m "feat: add verdict zod schemas"
```

---

### Task 3: `classifyVerdict` pure function

**Files:**
- Create: `src/lib/verdict.ts`
- Test: `src/lib/verdict.test.ts`

**Interfaces:**
- Consumes: `Belief` from `@/lib/schemas/belief`; `PhaseStatus` from `@/lib/schedule`; `VerdictCategory` from `@/lib/schemas/verdict`.
- Produces: `classifyVerdict(belief: Belief, schedule: PhaseStatus | null): VerdictCategory | null`. Returns `null` while the trial is still running; otherwise the category per the decision table.

- [ ] **Step 1: Write the failing test**

Create `src/lib/verdict.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyVerdict } from "@/lib/verdict";
import type { Belief } from "@/lib/schemas/belief";
import type { PhaseStatus } from "@/lib/schedule";

const done: PhaseStatus = {
  phase: null, kind: null, dayInPhase: 0, washout: false, done: true, started: true,
};
const running: PhaseStatus = { ...done, done: false };

const belief = (over: Partial<Belief>): Belief => ({
  pEffect: 0.5, effect: 0, ci: [-1, 1], nA: 5, nB: 5,
  model: "normal-normal", state: "live", ...over,
});

describe("classifyVerdict", () => {
  it("returns null while the trial is still running", () => {
    expect(classifyVerdict(belief({}), running)).toBe(null);
  });
  it("returns null when there is no schedule (never started)", () => {
    expect(classifyVerdict(belief({}), null)).toBe(null);
  });
  it("is insufficient when an arm has fewer than 3 check-ins", () => {
    expect(classifyVerdict(belief({ nA: 2, nB: 5 }), done)).toBe("inconclusive_insufficient");
    expect(classifyVerdict(belief({ nA: 5, nB: 1 }), done)).toBe("inconclusive_insufficient");
  });
  it("is helped when the CI is entirely above zero", () => {
    expect(classifyVerdict(belief({ effect: 1.2, ci: [0.4, 2.0] }), done)).toBe("helped");
  });
  it("is hurt when the CI is entirely below zero", () => {
    expect(classifyVerdict(belief({ effect: -1.2, ci: [-2.0, -0.4] }), done)).toBe("hurt");
  });
  it("is no-effect when the CI straddles zero", () => {
    expect(classifyVerdict(belief({ effect: 0.1, ci: [-0.5, 0.7] }), done)).toBe("inconclusive_no_effect");
  });
  it("treats a CI bound touching zero as straddling (not clear)", () => {
    expect(classifyVerdict(belief({ effect: 0.5, ci: [0, 1.0] }), done)).toBe("inconclusive_no_effect");
    expect(classifyVerdict(belief({ effect: -0.5, ci: [-1.0, 0] }), done)).toBe("inconclusive_no_effect");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/verdict.test.ts`
Expected: FAIL — cannot resolve `@/lib/verdict`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/verdict.ts`:

```ts
import type { Belief } from "@/lib/schemas/belief";
import type { PhaseStatus } from "@/lib/schedule";
import type { VerdictCategory } from "@/lib/schemas/verdict";

/** Minimum check-ins per arm before a verdict is trustworthy (matches the Phase 4 warming-up floor). */
const MIN_PER_ARM = 3;

/**
 * Classify a concluded trial's belief into a verdict category. Pure and
 * deterministic — the LLM never decides this. Returns null while the schedule
 * is still running (or absent). A "clear" verdict requires the 95% credible
 * interval to exclude zero, exactly the rule the belief meter draws; a bound
 * touching zero counts as straddling.
 */
export function classifyVerdict(
  belief: Belief,
  schedule: PhaseStatus | null,
): VerdictCategory | null {
  if (!schedule || !schedule.done) return null;
  if (belief.nA < MIN_PER_ARM || belief.nB < MIN_PER_ARM) {
    return "inconclusive_insufficient";
  }
  const [low, high] = belief.ci;
  if (low > 0) return "helped";
  if (high < 0) return "hurt";
  return "inconclusive_no_effect";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/verdict.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/verdict.ts src/lib/verdict.test.ts
git commit -m "feat: add deterministic verdict classification"
```

---

### Task 4: Analyst agent + analysis workflow

**Files:**
- Create: `src/mastra/agents/analyst.ts`
- Create: `src/mastra/workflows/analysis.ts`

**Interfaces:**
- Consumes: `verdictNarrativeSchema`, `verdictSchema`, `type Verdict`, `type VerdictCategory` from `@/lib/schemas/verdict`; `type Belief` from `@/lib/schemas/belief`.
- Produces: `analyst` agent + `narrateVerdict(input): Promise<string>`; `runAnalysis(input): Promise<Verdict>` where `input = { category: VerdictCategory; belief: Belief; statement: string; outcomeMetric: string }`. `runAnalysis` narrates then assembles the frozen `Verdict` DTO from `belief`.

No unit test: this task is exercised by the calibration/faithfulness evals and live verification, matching how `protocol-designer.ts` (also LLM-only) carries no unit test. Verify by typecheck.

- [ ] **Step 1: Write the Analyst agent**

Create `src/mastra/agents/analyst.ts`:

```ts
import { Agent } from "@mastra/core/agent";
import {
  verdictNarrativeSchema,
  type VerdictCategory,
} from "@/lib/schemas/verdict";

/**
 * Analyst (RESEARCH §3 / Phase 5). Translates a concluded trial's already-decided
 * category and the engine's numbers into a short, honest verdict. It does NOT do
 * math and never invents or contradicts a probability (RULES §3) — the number is
 * handed to it. Inconclusive outcomes are framed as legitimate findings.
 */
export const analyst = new Agent({
  id: "analyst",
  name: "Analyst",
  model: "openrouter/anthropic/claude-sonnet-4.6",
  instructions: `You are the Analyst for Hunch, a personal-science copilot.

A user just finished an n-of-1 self-experiment. You are given the verdict category
(already decided by the statistics — do not second-guess it), the effect size, the
probability the intervention helped, and the credible interval. Write a short,
plain-English verdict (2-4 sentences).

Rules:
- Never invent, recompute, or contradict a number. State the probability and effect
  you are given if you mention numbers; do not make up new ones.
- "helped" / "hurt": say so plainly, give the direction and rough size, and note the
  confidence. Keep it grounded — this is one person's result, not a universal truth.
- "inconclusive_no_effect": frame it as a real, useful finding — the data did not
  show a clear effect either way. Not a failure.
- "inconclusive_insufficient": explain there weren't enough logged days to judge, and
  that running longer would sharpen it. Encouraging, not scolding.
- No medical advice. No next-experiment prescriptions.`,
});

/** Ask the Analyst to narrate a decided category. Returns prose only. */
export async function narrateVerdict(input: {
  category: VerdictCategory;
  pEffect: number;
  effect: number;
  ci: [number, number];
  statement: string;
  outcomeMetric: string;
}): Promise<string> {
  const prompt = `Write the verdict for this concluded experiment.

Hypothesis: ${input.statement}
Outcome metric: ${input.outcomeMetric}
Verdict category (decided, do not change): ${input.category}
Probability the intervention helped (P(effect > 0)): ${input.pEffect.toFixed(2)}
Effect size (intervention minus baseline): ${input.effect.toFixed(2)}
95% credible interval on the effect: [${input.ci[0].toFixed(2)}, ${input.ci[1].toFixed(2)}]`;

  const response = await analyst.generate(prompt, {
    structuredOutput: { schema: verdictNarrativeSchema },
    modelSettings: { maxOutputTokens: 1024 },
  });

  return verdictNarrativeSchema.parse(response.object).narrative;
}
```

- [ ] **Step 2: Write the analysis workflow**

Create `src/mastra/workflows/analysis.ts`:

```ts
import { verdictSchema, type Verdict, type VerdictCategory } from "@/lib/schemas/verdict";
import type { Belief } from "@/lib/schemas/belief";
import { narrateVerdict } from "@/mastra/agents/analyst";

/**
 * The analysis step: narrate the decided category, then freeze the engine's
 * numbers into a Verdict DTO. Pure orchestration + assembly; persistence and the
 * status flip live in the API route (mirrors design.ts).
 */
export async function runAnalysis(input: {
  category: VerdictCategory;
  belief: Belief;
  statement: string;
  outcomeMetric: string;
}): Promise<Verdict> {
  const narrative = await narrateVerdict({
    category: input.category,
    pEffect: input.belief.pEffect,
    effect: input.belief.effect,
    ci: input.belief.ci,
    statement: input.statement,
    outcomeMetric: input.outcomeMetric,
  });

  return verdictSchema.parse({
    category: input.category,
    narrative,
    pEffect: input.belief.pEffect,
    effect: input.belief.effect,
    ci: input.belief.ci,
    nA: input.belief.nA,
    nB: input.belief.nB,
    model: input.belief.model,
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/mastra/agents/analyst.ts src/mastra/workflows/analysis.ts
git commit -m "feat: add Analyst agent + analysis workflow"
```

---

### Task 5: Deterministic calibration eval (Brier gate)

**Files:**
- Create: `src/lib/bayes/calibration.test.ts`

**Interfaces:**
- Consumes: `computeBelief` from `@/lib/bayes`.
- Produces: nothing exported. A normal-suite test (NOT `.eval.test.ts`, so it runs on every `npm test`, no key needed) that proves the engine's `pEffect` is calibrated: confident-and-correct on trials with a real effect (low Brier), and appropriately uncertain (~0.5) on null trials. All randomness is a local seeded PRNG — the production engine stays RNG-free.

- [ ] **Step 1: Write the calibration test**

Create `src/lib/bayes/calibration.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeBelief } from "@/lib/bayes";

/** Deterministic PRNG (mulberry32) — test-only; the engine itself uses no RNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box-Muller, driven by the seeded PRNG. */
function gauss(rng: () => number): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const N_PER_ARM = 6;

/** One continuous trial: baseline ~ N(0,1), intervention ~ N(shift,1). */
function continuousTrial(rng: () => number, shift: number) {
  const a = Array.from({ length: N_PER_ARM }, () => gauss(rng));
  const b = Array.from({ length: N_PER_ARM }, () => shift + gauss(rng));
  return computeBelief(
    [
      ...a.map((value) => ({ phase: "A", value })),
      ...b.map((value) => ({ phase: "B", value })),
    ],
    "continuous",
  );
}

describe("engine calibration", () => {
  it("is confident and correct on trials with a real effect (low Brier)", () => {
    const rng = mulberry32(42);
    // Strong effects in both directions; outcome = (true shift > 0).
    const shifts = [2, -2, 2.5, -2.5, 3, -3, 2, -2, 2.5, -2.5];
    let brier = 0;
    let correct = 0;
    for (let i = 0; i < shifts.length; i++) {
      const shift = shifts[i % shifts.length] + gauss(rng) * 0.1;
      const { pEffect } = continuousTrial(rng, shift);
      const outcome = shift > 0 ? 1 : 0;
      brier += (pEffect - outcome) ** 2;
      if ((pEffect > 0.5 ? 1 : 0) === outcome) correct++;
    }
    brier /= shifts.length;
    expect(brier).toBeLessThan(0.1);
    expect(correct).toBe(shifts.length); // direction always right on strong effects
  });

  it("is appropriately uncertain on null trials (pEffect near 0.5)", () => {
    const rng = mulberry32(7);
    const ps: number[] = [];
    for (let i = 0; i < 20; i++) ps.push(continuousTrial(rng, 0).pEffect);
    const mean = ps.reduce((s, p) => s + p, 0) / ps.length;
    // No true effect -> the engine should not be confident either way.
    expect(mean).toBeGreaterThan(0.35);
    expect(mean).toBeLessThan(0.65);
  });
});
```

- [ ] **Step 2: Run the test — it must pass against the real engine**

Run: `npm test -- src/lib/bayes/calibration.test.ts`
Expected: PASS (2 tests). This is a characterization gate, not RED-first: the engine already exists, and a passing run proves it is calibrated. If it FAILS, do NOT loosen the thresholds blindly — the engine's calibration has regressed; stop and report (use systematic-debugging). Include the printed Brier value in your report.

- [ ] **Step 3: Run the full suite (no regressions)**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/bayes/calibration.test.ts
git commit -m "test: add deterministic engine calibration (Brier) gate"
```

---

### Task 6: `GET /verdict` route + `useVerdict` hook

**Files:**
- Create: `src/app/api/hunch/[id]/verdict/route.ts`
- Create: `src/hooks/use-verdict.ts`

**Interfaces:**
- Consumes: `computeBelief` from `@/lib/bayes`; `currentPhase` from `@/lib/schedule`; `classifyVerdict` from `@/lib/verdict`; `runAnalysis` from `@/mastra/workflows/analysis`; `verdictSchema`, `type Verdict` from `@/lib/schemas/verdict`; `protocolDesignSchema` from `@/lib/schemas/protocol`; `auth`, `db`.
- Produces: `GET /api/hunch/[id]/verdict` → `200 { verdict: Verdict }` | `401` | `404` | `409` (trial still running). Hook `useVerdict(hunchId)` → `useQuery` of `{ verdict: Verdict }`.

Thin route; verified live in Task 8. No route unit test (codebase convention).

- [ ] **Step 1: Write the route handler**

Create `src/app/api/hunch/[id]/verdict/route.ts`:

```ts
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { computeBelief } from "@/lib/bayes";
import { currentPhase } from "@/lib/schedule";
import { classifyVerdict } from "@/lib/verdict";
import { runAnalysis } from "@/mastra/workflows/analysis";
import { verdictSchema, type Verdict } from "@/lib/schemas/verdict";
import { protocolDesignSchema } from "@/lib/schemas/protocol";

/** Shape a persisted Verdict row into the API DTO (ciLow/ciHigh -> ci tuple). */
function toDto(row: {
  category: string; narrative: string; pEffect: number; effect: number;
  ciLow: number; ciHigh: number; nA: number; nB: number; model: string;
}): Verdict {
  return verdictSchema.parse({
    category: row.category,
    narrative: row.narrative,
    pEffect: row.pEffect,
    effect: row.effect,
    ci: [row.ciLow, row.ciHigh],
    nA: row.nA,
    nB: row.nB,
    model: row.model,
  });
}

/**
 * Phase 5: the frozen verdict. Returns the stored verdict if it exists; otherwise,
 * once the ABA schedule has ended, computes the belief, classifies it, has the
 * Analyst narrate it, persists the snapshot, flips the hunch to "concluded", and
 * returns it. Still-running trials get 409 and keep showing the live meter.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: {
      hypothesis: true,
      protocol: true,
      verdict: true,
      checkIns: { orderBy: { loggedAt: "asc" } },
    },
  });
  if (!hunch || !hunch.hypothesis) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }

  if (hunch.verdict) {
    return NextResponse.json({ verdict: toDto(hunch.verdict) });
  }

  if (!hunch.protocol?.startedAt) {
    return NextResponse.json({ error: "This trial hasn't started." }, { status: 409 });
  }

  const outcomeType = hunch.hypothesis.outcomeType as "binary" | "continuous";
  const belief = computeBelief(
    hunch.checkIns.map((c) => ({ phase: c.phase, value: c.value })),
    outcomeType,
  );
  const design = protocolDesignSchema.parse(hunch.protocol.design);
  const schedule = currentPhase(hunch.protocol.startedAt, design, new Date());

  const category = classifyVerdict(belief, schedule);
  if (category === null) {
    return NextResponse.json({ error: "This trial is still running." }, { status: 409 });
  }

  const verdict = await runAnalysis({
    category,
    belief,
    statement: hunch.hypothesis.statement,
    outcomeMetric: hunch.hypothesis.outcomeMetric,
  });

  await db.$transaction([
    db.verdict.create({
      data: {
        hunchId: hunch.id,
        category: verdict.category,
        narrative: verdict.narrative,
        pEffect: verdict.pEffect,
        effect: verdict.effect,
        ciLow: verdict.ci[0],
        ciHigh: verdict.ci[1],
        nA: verdict.nA,
        nB: verdict.nB,
        model: verdict.model,
      },
    }),
    db.hunch.update({ where: { id: hunch.id }, data: { status: "concluded" } }),
  ]);

  return NextResponse.json({ verdict });
}
```

- [ ] **Step 2: Write the hook**

Create `src/hooks/use-verdict.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import type { Verdict } from "@/lib/schemas/verdict";

export type VerdictResponse = { verdict: Verdict };

async function fetchVerdict(hunchId: string): Promise<VerdictResponse> {
  const res = await fetch(`/api/hunch/${hunchId}/verdict`);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? "Could not load your verdict.");
  }
  return body as VerdictResponse;
}

/** The frozen verdict for a concluded hunch. Generated server-side on first read. */
export function useVerdict(hunchId: string) {
  return useQuery({
    queryKey: ["verdict", hunchId],
    queryFn: () => fetchVerdict(hunchId),
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/hunch/[id]/verdict/route.ts" src/hooks/use-verdict.ts
git commit -m "feat: add verdict route + useVerdict hook"
```

---

### Task 7: Verdict component

**Files:**
- Create: `src/components/verdict.tsx`

**Interfaces:**
- Consumes: `useVerdict` from `@/hooks/use-verdict`; `BeliefMeter` from `@/components/belief-meter`; `type Belief` from `@/lib/schemas/belief`; `type Verdict` from `@/lib/schemas/verdict`.
- Produces: `VerdictView({ hunchId }: { hunchId: string })` — a client component that fetches and renders the frozen verdict.

- [ ] **Step 1: Write the component**

Create `src/components/verdict.tsx`:

```tsx
"use client";

import { BeliefMeter } from "@/components/belief-meter";
import { useVerdict } from "@/hooks/use-verdict";
import type { Belief } from "@/lib/schemas/belief";
import type { Verdict } from "@/lib/schemas/verdict";

const HEADLINE: Record<Verdict["category"], { title: string; tone: string }> = {
  helped: { title: "It helped ✓", tone: "text-foreground" },
  hurt: { title: "It hurt ✗", tone: "text-destructive" },
  inconclusive_no_effect: { title: "No detectable effect", tone: "text-muted-foreground" },
  inconclusive_insufficient: { title: "Not enough data", tone: "text-muted-foreground" },
};

/** Reconstruct a live Belief from the frozen snapshot so we can reuse the meter. */
function beliefFrom(v: Verdict): Belief {
  return {
    pEffect: v.pEffect, effect: v.effect, ci: v.ci,
    nA: v.nA, nB: v.nB, model: v.model, state: "live",
  };
}

/**
 * The concluded-trial verdict: a category headline, the Analyst's plain-English
 * verdict, and (when the data was sufficient) the frozen credible-interval meter.
 * Inconclusive outcomes are shown as legitimate findings, not errors.
 */
export function VerdictView({ hunchId }: { hunchId: string }) {
  const query = useVerdict(hunchId);

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">Writing your verdict…</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-destructive">{query.error.message}</p>;
  }

  const v = query.data.verdict;
  const head = HEADLINE[v.category];
  const hasStats = v.category !== "inconclusive_insufficient";

  return (
    <section className="space-y-4 rounded-xl border p-6">
      <div>
        <p className="text-sm text-muted-foreground">Verdict</p>
        <h2 className={`text-3xl font-bold ${head.tone}`}>{head.title}</h2>
      </div>
      <p className="text-sm leading-6">{v.narrative}</p>
      {hasStats && <BeliefMeter belief={beliefFrom(v)} />}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/verdict.tsx
git commit -m "feat: add verdict view component"
```

---

### Task 8: Dashboard wiring + register Analyst + live verify + ledger

**Files:**
- Modify: `src/app/hunch/[id]/page.tsx`
- Modify: `src/mastra/index.ts`
- Modify: `src/mastra/index.test.ts`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: `VerdictView` from `@/components/verdict`; existing `useBelief`, `BeliefMeter`, `CheckInTap`.
- Produces: the dashboard renders the verdict once the schedule is `done`, otherwise the live meter + check-in tap; the Analyst is registered on the root Mastra instance.

- [ ] **Step 1: Register the Analyst (update the index test first — RED)**

Edit `src/mastra/index.test.ts` to expect the analyst. Find the assertion listing the agents and add `analyst`. If the current test reads like:

```ts
expect(Object.keys(mastra.getAgents())).toEqual(
  expect.arrayContaining(["hypothesisCoach", "protocolDesigner", "safetyReviewer"]),
);
```

change the array to include `"analyst"`. (If the test's exact accessor differs, keep its shape and just add the `analyst` key to the expected set.)

Run: `npm test -- src/mastra/index.test.ts`
Expected: FAIL — analyst not registered.

- [ ] **Step 2: Register the Analyst (GREEN)**

Edit `src/mastra/index.ts`: import and register `analyst`:

```ts
import { analyst } from "@/mastra/agents/analyst";
// ...
export const mastra = new Mastra({
  agents: { hypothesisCoach, protocolDesigner, safetyReviewer, analyst },
});
```

Run: `npm test -- src/mastra/index.test.ts`
Expected: PASS.

- [ ] **Step 3: Wire the dashboard**

Edit `src/app/hunch/[id]/page.tsx`. Import `VerdictView`:

```tsx
import { VerdictView } from "@/components/verdict";
```

Then, in the render after `const { belief, schedule } = query.data;`, branch on the schedule being done. Replace the returned `<main>` block so a concluded schedule shows the verdict instead of the tap:

```tsx
  const { belief, schedule } = query.data;
  const outcomeType = belief.model === "beta-binomial" ? "binary" : "continuous";
  const concluded = schedule?.done ?? false;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Your experiment</h1>
      {concluded ? (
        <VerdictView hunchId={id} />
      ) : (
        <>
          <BeliefMeter belief={belief} />
          <CheckInTap hunchId={id} schedule={schedule} outcomeType={outcomeType} />
        </>
      )}
    </main>
  );
```

- [ ] **Step 4: Full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 5: Live verification**

With Docker + dev server up (`docker compose up -d db && npm run dev`), and a real Better Auth session, seed a hunch whose protocol `startedAt` is far enough in the past that the ABA schedule is fully `done`, with ≥3 check-ins in each of the A and B arms. Then:
- `GET /api/hunch/<id>/verdict` (first call) → `200 { verdict }` with a non-empty narrative; a `Verdict` row now exists; `Hunch.status` is `concluded`.
- `GET` again → same verdict returned (no second LLM call — the row is served).
- Seed a second concluded hunch with an arm having < 3 check-ins → verdict category `inconclusive_insufficient`, narrative framed as legitimate.
- Confirm exactly one `Verdict` row per hunch (`@@unique` on `hunchId`).
- 409 on a still-running hunch's verdict; 401 unauth; 404 authed non-owned id.

The Analyst faithfulness eval (`analyst.eval.test.ts`) is authored in Task 9; the live check here confirms the wiring and persistence.

- [ ] **Step 6: Record the ledger + commit**

Append a `## Phase 5` section to `.superpowers/sdd/progress.md` summarizing tasks, gates (typecheck + lint + unit tests + counts, including the calibration Brier value), and the live verification result. Then:

```bash
git add src/app/hunch/[id]/page.tsx src/mastra/index.ts src/mastra/index.test.ts
git commit -m "feat: show verdict on concluded dashboard + register Analyst"
```

(`.superpowers/` is gitignored — the ledger update is local only, matching prior phases.)

---

### Task 9: Analyst faithfulness eval (key-gated)

**Files:**
- Create: `src/mastra/agents/analyst.eval.test.ts`

**Interfaces:**
- Consumes: `narrateVerdict` from `@/mastra/agents/analyst`.
- Produces: a `test:eval`-suite test (self-skips without `OPENROUTER_API_KEY`) asserting the narrative faithfully reflects each category and never contradicts the number.

- [ ] **Step 1: Write the eval**

Create `src/mastra/agents/analyst.eval.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { narrateVerdict } from "@/mastra/agents/analyst";

const hasKey = Boolean(process.env.OPENROUTER_API_KEY);

/**
 * Analyst faithfulness eval: the narrative must reflect the decided category and
 * never contradict the given number. Self-skips without OPENROUTER_API_KEY.
 */
describe.skipIf(!hasKey)("Analyst verdict quality", () => {
  test("narrates a clear positive result without contradicting it", async () => {
    const narrative = await narrateVerdict({
      category: "helped",
      pEffect: 0.97,
      effect: 1.2,
      ci: [0.4, 2.0],
      statement: "Cutting afternoon caffeine increases nightly sleep duration.",
      outcomeMetric: "hours of sleep from a tracker",
    });
    expect(narrative.length).toBeGreaterThan(0);
    // Must not claim the opposite direction.
    expect(narrative.toLowerCase()).not.toMatch(/did not help|no effect|hurt|worse|reduced your sleep/);
  }, 60_000);

  test("frames an inconclusive result as legitimate, not a failure", async () => {
    const narrative = await narrateVerdict({
      category: "inconclusive_no_effect",
      pEffect: 0.55,
      effect: 0.1,
      ci: [-0.6, 0.8],
      statement: "A standing desk improves afternoon focus.",
      outcomeMetric: "focus rated 1-10 at day's end",
    });
    expect(narrative.length).toBeGreaterThan(0);
    // Must not overclaim a positive verdict on inconclusive data.
    expect(narrative.toLowerCase()).not.toMatch(/clearly helped|definitely|proven|strong evidence/);
  }, 60_000);
});
```

- [ ] **Step 2: Run the eval (with a key if available)**

Run: `npm run test:eval -- src/mastra/agents/analyst.eval.test.ts`
Expected: PASS if `OPENROUTER_API_KEY` is set; SKIPPED otherwise (report which). If it runs and an assertion fails, that is a real faithfulness finding — report it, don't weaken the assertion.

- [ ] **Step 3: Confirm the normal suite is unaffected**

Run: `npm test`
Expected: all PASS (the eval file is excluded from the normal suite by config).

- [ ] **Step 4: Commit**

```bash
git add src/mastra/agents/analyst.eval.test.ts
git commit -m "test: add Analyst faithfulness eval"
```

---

## Self-Review

**Spec coverage:**
- Decision logic (category table, CI-crosses-zero, 3-per-arm floor) → Task 3 + Task 2. ✓
- Engine owns number / LLM narrates (no arithmetic) → Task 4 (agent instructions + prose-only output). ✓
- Store-once verdict + `concluded` flip → Task 1 (model) + Task 6 (persist + transaction). ✓
- Lazy-on-read generation → Task 6 route flow. ✓
- Brier calibration gate (deterministic, normal suite) → Task 5. ✓
- Analyst faithfulness eval (key-gated) → Task 9. ✓
- `verdict.tsx` + inconclusive-as-legitimate framing → Task 7. ✓
- Dashboard swaps tap→verdict on conclusion → Task 8. ✓
- Analyst registered on Mastra instance → Task 8. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. ✓

**Type consistency:** `classifyVerdict(belief, schedule)` returns `VerdictCategory | null` (Task 3), consumed by the route which guards the null (Task 6). `runAnalysis` takes non-null `category: VerdictCategory` (Task 4), and the route only calls it after the null guard. `Verdict` DTO uses `ci: [number,number]`; the DB row uses `ciLow`/`ciHigh`; the route's `toDto` and `create` map between them consistently (Tasks 1, 6). `narrateVerdict` returns `string`; `runAnalysis` returns `Verdict`. `VerdictView` reconstructs a `Belief` with `state:"live"` to reuse `BeliefMeter` (Task 7). ✓

**Note on the index test (Task 8, Step 1):** the exact accessor in `src/mastra/index.test.ts` should be preserved; only the expected agent-key set changes. The implementer reads the current test before editing.
