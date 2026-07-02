# Phase 6 — Causal-graph Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirmed trial verdicts become per-user `CausalEdge`s; creating a new hunch recalls the relevant past findings (deterministic pre-filter → LLM relevance) and surfaces them on the Hunch Card — closing the memory loop without touching the Bayesian engine.

**Architecture:** On conclusion, the Phase 5 verdict transaction also writes a `CausalEdge` (helped→increases, hurt→decreases, no_effect→none; insufficient→nothing), derived deterministically from the frozen verdict + hypothesis. On hunch creation, a pure keyword-overlap pre-filter narrows the user's edges to candidates, a `memory` agent picks the genuinely related ones, and they are returned for the card + fed to the Coach as context. Surface-only: engine math and Phase 4/5 calibration are untouched. Recall is additive — any failure degrades to an empty list and never blocks creation.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma v7 (generated client at `src/generated/prisma`), Better Auth, TanStack Query v5, zod 4.4.3, Vitest 4, Mastra (`@mastra/core`), Claude via OpenRouter.

## Global Constraints

- No new npm dependencies. No pgvector, no embedding dependency.
- NO `Co-Authored-By` / "Generated with Claude Code" trailers in commits. git user is "Gayatri Patil".
- **No schema/migration work:** the `CausalEdge` model already exists and is migrated (`prisma/migrations/20260622114417_init`). Do NOT edit `prisma/schema.prisma`.
- **Surface-only (RULES §3 spirit):** recalled priors inform the user and the Coach's prose only; they never seed the Bayesian engine and no LLM produces a stored number.
- The `memory` agent selects from candidates only — it never invents a finding; hallucinated ids are dropped defensively in pure code, not merely trusted.
- Routes are thin and verified live — NO route unit tests (Phase 3/4/5 convention). Pure logic (schemas, `writeEdgeData`, `selectCandidatePriors`, `toPriors`) IS unit-tested.
- Path alias `@/` → `src/`.
- `memory` agent model: `openrouter/anthropic/claude-sonnet-4.6`; cap `modelSettings.maxOutputTokens: 1024` (matches other agents).
- Verdict categories (exact strings): `helped`, `hurt`, `inconclusive_no_effect`, `inconclusive_insufficient`. Direction strings (exact): `increases`, `decreases`, `none`.

---

### Task 1: Prior + recall zod schemas

**Files:**
- Create: `src/lib/schemas/prior.ts`
- Test: `src/lib/schemas/prior.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `priorSchema` (recalled-finding DTO), `type Prior`; `recallResultSchema` (memory agent output `{ relatedSourceHunchIds: string[] }`), `type RecallResult`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/schemas/prior.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { priorSchema, recallResultSchema } from "@/lib/schemas/prior";

describe("prior schemas", () => {
  it("validates a recalled prior DTO", () => {
    const dto = {
      cause: "Cutting afternoon caffeine increases nightly sleep duration.",
      effect: "hours of sleep from a tracker",
      direction: "increases",
      effectSize: 2.03,
      confidence: 0.97,
      sourceHunchId: "h_abc",
    };
    expect(priorSchema.safeParse(dto).success).toBe(true);
  });
  it("rejects an unknown direction", () => {
    const dto = {
      cause: "x", effect: "y", direction: "maybe",
      effectSize: 1, confidence: 0.5, sourceHunchId: "h1",
    };
    expect(priorSchema.safeParse(dto).success).toBe(false);
  });
  it("accepts a recall result with selected ids", () => {
    expect(
      recallResultSchema.safeParse({ relatedSourceHunchIds: ["h1", "h2"] }).success,
    ).toBe(true);
    expect(
      recallResultSchema.safeParse({ relatedSourceHunchIds: [] }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/schemas/prior.test.ts`
Expected: FAIL — cannot resolve `@/lib/schemas/prior`.

- [ ] **Step 3: Write the schemas**

Create `src/lib/schemas/prior.ts`:

```ts
import { z } from "zod";

/**
 * A recalled past finding, surfaced when a related new hunch is created. The
 * fields mirror a stored CausalEdge; `cause` is the sharpened hypothesis
 * statement, `effect` the outcome metric, `direction` the verdict's sign.
 */
export const priorSchema = z.object({
  cause: z.string().trim().min(1),
  effect: z.string().trim().min(1),
  direction: z.enum(["increases", "decreases", "none"]),
  effectSize: z.number(),
  confidence: z.number().min(0).max(1),
  sourceHunchId: z.string().trim().min(1),
});
export type Prior = z.infer<typeof priorSchema>;

/** The memory agent's structured output: which candidate findings are relevant. */
export const recallResultSchema = z.object({
  relatedSourceHunchIds: z.array(z.string()),
});
export type RecallResult = z.infer<typeof recallResultSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/schemas/prior.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/prior.ts src/lib/schemas/prior.test.ts
git commit -m "feat: add prior + recall zod schemas"
```

---

### Task 2: Causal-graph write mapping + read

**Files:**
- Create: `src/lib/memory/causal-graph.ts`
- Test: `src/lib/memory/causal-graph.test.ts`

**Interfaces:**
- Consumes: `VerdictCategory` from `@/lib/schemas/verdict`.
- Produces:
  - `type CausalEdgeInput = { userId, cause, effect, direction: "increases"|"decreases"|"none", effectSize, confidence, sourceHunchId }`.
  - `writeEdgeData(input): CausalEdgeInput | null` — pure mapping; `null` for `inconclusive_insufficient`.
  - `readEdges(userId: string): Promise<CausalEdge[]>` — thin DB read of a user's edges, newest first. (`CausalEdge` is the Prisma row type from `@/generated/prisma`.)

- [ ] **Step 1: Write the failing test** (pure `writeEdgeData` only — `readEdges` is a thin DB read, verified live per convention)

Create `src/lib/memory/causal-graph.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { writeEdgeData } from "@/lib/memory/causal-graph";

const base = {
  effect: 2.0,
  pEffect: 0.97,
  statement: "Cutting afternoon caffeine increases nightly sleep duration.",
  outcomeMetric: "hours of sleep from a tracker",
  hunchId: "h1",
  userId: "u1",
};

describe("writeEdgeData", () => {
  it("maps helped -> increases with the frozen numbers", () => {
    const edge = writeEdgeData({ ...base, category: "helped" });
    expect(edge).toEqual({
      userId: "u1",
      cause: base.statement,
      effect: base.outcomeMetric,
      direction: "increases",
      effectSize: 2.0,
      confidence: 0.97,
      sourceHunchId: "h1",
    });
  });
  it("maps hurt -> decreases", () => {
    expect(writeEdgeData({ ...base, category: "hurt" })?.direction).toBe("decreases");
  });
  it("maps inconclusive_no_effect -> none", () => {
    expect(
      writeEdgeData({ ...base, category: "inconclusive_no_effect" })?.direction,
    ).toBe("none");
  });
  it("writes no edge for inconclusive_insufficient", () => {
    expect(writeEdgeData({ ...base, category: "inconclusive_insufficient" })).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/memory/causal-graph.test.ts`
Expected: FAIL — cannot resolve `@/lib/memory/causal-graph`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/memory/causal-graph.ts`:

```ts
import { db } from "@/lib/db";
import type { CausalEdge } from "@/generated/prisma/client";
import type { VerdictCategory } from "@/lib/schemas/verdict";

/** The row shape written to CausalEdge (matches db.causalEdge.create's `data`). */
export type CausalEdgeInput = {
  userId: string;
  cause: string;
  effect: string;
  direction: "increases" | "decreases" | "none";
  effectSize: number;
  confidence: number;
  sourceHunchId: string;
};

/** Map a category to its causal direction, or null if it is not a finding. */
const DIRECTION: Record<VerdictCategory, "increases" | "decreases" | "none" | null> = {
  helped: "increases",
  hurt: "decreases",
  inconclusive_no_effect: "none",
  inconclusive_insufficient: null, // not enough data — no edge
};

/**
 * Build the CausalEdge to persist for a concluded verdict, deriving every field
 * from data already stored (no LLM at write time). Returns null when the verdict
 * is not a finding (insufficient data), so the caller writes no edge.
 */
export function writeEdgeData(input: {
  category: VerdictCategory;
  effect: number;
  pEffect: number;
  statement: string;
  outcomeMetric: string;
  hunchId: string;
  userId: string;
}): CausalEdgeInput | null {
  const direction = DIRECTION[input.category];
  if (direction === null) return null;
  return {
    userId: input.userId,
    cause: input.statement,
    effect: input.outcomeMetric,
    direction,
    effectSize: input.effect,
    confidence: input.pEffect,
    sourceHunchId: input.hunchId,
  };
}

/** All of a user's stored findings, newest first. */
export function readEdges(userId: string): Promise<CausalEdge[]> {
  return db.causalEdge.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/memory/causal-graph.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck** (confirms the generated `CausalEdge` type resolves)

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/memory/causal-graph.ts src/lib/memory/causal-graph.test.ts
git commit -m "feat: add causal-graph edge write mapping + read"
```

---

### Task 3: Candidate pre-filter + prior mapping (pure)

**Files:**
- Create: `src/lib/memory/priors.ts`
- Test: `src/lib/memory/priors.test.ts`

**Interfaces:**
- Consumes: `CausalEdge` from `@/generated/prisma/client`; `Prior` from `@/lib/schemas/prior`.
- Produces:
  - `selectCandidatePriors(edges: CausalEdge[], rawText: string, limit?: number): CausalEdge[]` — pure keyword-overlap pre-filter, highest overlap first, only edges with a non-null `sourceHunchId` and overlap > 0, capped at `limit` (default 5).
  - `toPriors(candidates: CausalEdge[], relatedSourceHunchIds: string[]): Prior[]` — keep only candidates whose `sourceHunchId` is in the selected id set (drops hallucinated ids), map to the `Prior` DTO.

- [ ] **Step 1: Write the failing test**

Create `src/lib/memory/priors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { selectCandidatePriors, toPriors } from "@/lib/memory/priors";
import type { CausalEdge } from "@/generated/prisma/client";

const edge = (over: Partial<CausalEdge>): CausalEdge => ({
  id: "e", userId: "u", cause: "", effect: "", direction: "increases",
  effectSize: 1, confidence: 0.9, sourceHunchId: "h", createdAt: new Date(),
  ...over,
});

const caffeine = edge({
  sourceHunchId: "h_caf",
  cause: "Cutting afternoon caffeine increases nightly sleep duration.",
  effect: "hours of sleep from a tracker",
});
const desk = edge({
  sourceHunchId: "h_desk",
  cause: "A standing desk improves afternoon focus.",
  effect: "focus rated 1-10",
});

describe("selectCandidatePriors", () => {
  it("surfaces an edge that shares keywords with the hunch", () => {
    const out = selectCandidatePriors([caffeine, desk], "does caffeine hurt my sleep?");
    expect(out.map((e) => e.sourceHunchId)).toEqual(["h_caf"]);
  });
  it("returns nothing when no keywords overlap", () => {
    expect(selectCandidatePriors([caffeine, desk], "did my running pace improve?")).toEqual([]);
  });
  it("ranks higher-overlap edges first and respects the limit", () => {
    const out = selectCandidatePriors([desk, caffeine], "caffeine and sleep hours", 1);
    expect(out).toHaveLength(1);
    expect(out[0].sourceHunchId).toBe("h_caf");
  });
  it("ignores stop-words so common words don't create false matches", () => {
    // "the" / "my" / "a" overlap but are stop-words -> no real match.
    expect(selectCandidatePriors([desk], "the a my of")).toEqual([]);
  });
  it("skips edges with no sourceHunchId", () => {
    const orphan = edge({ sourceHunchId: null, cause: "caffeine sleep", effect: "sleep" });
    expect(selectCandidatePriors([orphan], "caffeine sleep")).toEqual([]);
  });
});

describe("toPriors", () => {
  it("keeps only selected candidates and maps to the Prior DTO", () => {
    const priors = toPriors([caffeine, desk], ["h_caf"]);
    expect(priors).toHaveLength(1);
    expect(priors[0]).toMatchObject({
      cause: caffeine.cause,
      effect: caffeine.effect,
      direction: "increases",
      sourceHunchId: "h_caf",
    });
  });
  it("drops ids that were not in the candidate set (hallucinated)", () => {
    expect(toPriors([caffeine], ["h_ghost"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/memory/priors.test.ts`
Expected: FAIL — cannot resolve `@/lib/memory/priors`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/memory/priors.ts`:

```ts
import type { CausalEdge } from "@/generated/prisma/client";
import type { Prior } from "@/lib/schemas/prior";

/** Words too common to signal topical overlap. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "my", "me",
  "i", "is", "it", "does", "do", "did", "my", "your", "with", "at", "by",
  "this", "that", "these", "those", "was", "were", "are", "am", "be", "been",
  "have", "has", "had", "if", "as", "so", "than", "then", "but", "not", "no",
]);

/** Lowercase word tokens, stop-words removed, length >= 3. */
function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return new Set(words.filter((w) => w.length >= 3 && !STOP_WORDS.has(w)));
}

/** Count of shared meaningful tokens between the hunch and an edge. */
function overlapScore(hunchTokens: Set<string>, edge: CausalEdge): number {
  const edgeTokens = tokenize(`${edge.cause} ${edge.effect}`);
  let score = 0;
  for (const t of edgeTokens) if (hunchTokens.has(t)) score++;
  return score;
}

/**
 * Deterministic pre-filter: the user's edges that share meaningful keywords with
 * the new hunch, most-overlapping first, capped at `limit`. Pure — no LLM, no DB.
 * The LLM relevance step (memory agent) refines this candidate set; this layer
 * only has to be cheap and recall-generous.
 */
export function selectCandidatePriors(
  edges: CausalEdge[],
  rawText: string,
  limit = 5,
): CausalEdge[] {
  const hunchTokens = tokenize(rawText);
  return edges
    .filter((e) => e.sourceHunchId !== null)
    .map((e) => ({ edge: e, score: overlapScore(hunchTokens, e) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.edge);
}

/**
 * Map the agent-selected candidates to Prior DTOs. Only candidates whose
 * sourceHunchId the agent actually returned survive, so a hallucinated id (one
 * never offered as a candidate) is dropped rather than trusted.
 */
export function toPriors(
  candidates: CausalEdge[],
  relatedSourceHunchIds: string[],
): Prior[] {
  const selected = new Set(relatedSourceHunchIds);
  return candidates
    .filter((e) => e.sourceHunchId !== null && selected.has(e.sourceHunchId))
    .map((e) => ({
      cause: e.cause,
      effect: e.effect,
      direction: e.direction as Prior["direction"],
      effectSize: e.effectSize ?? 0,
      confidence: e.confidence ?? 0,
      sourceHunchId: e.sourceHunchId as string,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/memory/priors.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/memory/priors.ts src/lib/memory/priors.test.ts
git commit -m "feat: add candidate pre-filter + prior mapping"
```

---

### Task 4: Memory agent

**Files:**
- Create: `src/mastra/agents/memory.ts`

**Interfaces:**
- Consumes: `recallResultSchema`, `type RecallResult` from `@/lib/schemas/prior`; `CausalEdge` from `@/generated/prisma/client`.
- Produces: `memory` agent + `recallRelevantPriors(rawText: string, candidates: CausalEdge[]): Promise<RecallResult>`.

No unit test: LLM-only, exercised by the faithfulness eval (Task 9) + live verification, matching `protocol-designer.ts` / `analyst.ts`. Verify by typecheck.

- [ ] **Step 1: Write the agent**

Create `src/mastra/agents/memory.ts`:

```ts
import { Agent } from "@mastra/core/agent";
import type { CausalEdge } from "@/generated/prisma/client";
import { recallResultSchema, type RecallResult } from "@/lib/schemas/prior";

/**
 * Memory agent (RESEARCH §5 / Phase 6). Given a new hunch and a small set of the
 * user's PAST findings (candidates the deterministic pre-filter surfaced), it
 * returns which candidates are genuinely about the same intervention/outcome. It
 * selects from the given candidates only — it never invents a finding and never
 * produces a number (RULES §3).
 */
export const memory = new Agent({
  id: "memory",
  name: "Memory",
  model: "openrouter/anthropic/claude-sonnet-4.6",
  instructions: `You are the Memory for Hunch, a personal-science copilot.

The user just wrote a new hunch. You are given a short list of their PAST
findings, each with an id, a cause, and an effect. Decide which past findings are
genuinely about the same intervention or the same outcome as the new hunch — the
ones worth reminding them of ("you already learned this").

Rules:
- Return only ids from the given candidates. Never invent an id or a finding.
- Include a candidate only if it is clearly related (same intervention, same
  outcome, or an obvious synonym — e.g. "coffee" and "caffeine"). When unsure,
  leave it out.
- If nothing is clearly related, return an empty list.
- Do not produce or alter any number.`,
});

/** Ask the Memory agent which candidate findings relate to the new hunch. */
export async function recallRelevantPriors(
  rawText: string,
  candidates: CausalEdge[],
): Promise<RecallResult> {
  const list = candidates
    .map((c) => `- id: ${c.sourceHunchId} | cause: ${c.cause} | effect: ${c.effect}`)
    .join("\n");

  const prompt = `New hunch: "${rawText}"

Past findings (candidates):
${list}

Return the ids of the findings genuinely related to this new hunch.`;

  const response = await memory.generate(prompt, {
    structuredOutput: { schema: recallResultSchema },
    modelSettings: { maxOutputTokens: 1024 },
  });

  return recallResultSchema.parse(response.object);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/mastra/agents/memory.ts
git commit -m "feat: add memory recall agent"
```

---

### Task 5: Recall orchestration

**Files:**
- Create: `src/lib/memory/recall.ts`

**Interfaces:**
- Consumes: `readEdges` from `@/lib/memory/causal-graph`; `selectCandidatePriors`, `toPriors` from `@/lib/memory/priors`; `recallRelevantPriors` from `@/mastra/agents/memory`; `type Prior` from `@/lib/schemas/prior`.
- Produces: `recallPriors(userId: string, rawText: string): Promise<Prior[]>` — orchestration; returns `[]` on any failure (recall is additive, never blocks creation).

Thin orchestration over already-tested pure units + one LLM call; verified live in Task 8. No unit test (the pure parts — pre-filter, mapping — are covered in Task 3).

- [ ] **Step 1: Write the implementation**

Create `src/lib/memory/recall.ts`:

```ts
import { readEdges } from "@/lib/memory/causal-graph";
import { selectCandidatePriors, toPriors } from "@/lib/memory/priors";
import { recallRelevantPriors } from "@/mastra/agents/memory";
import type { Prior } from "@/lib/schemas/prior";

/**
 * Recall the user's past findings relevant to a new hunch: read their edges,
 * pre-filter to candidates deterministically, let the memory agent pick the
 * genuinely related ones, and map to Prior DTOs. Additive by design — any
 * failure (no edges, agent error) yields an empty list so hunch creation is
 * never blocked.
 */
export async function recallPriors(userId: string, rawText: string): Promise<Prior[]> {
  try {
    const edges = await readEdges(userId);
    const candidates = selectCandidatePriors(edges, rawText);
    if (candidates.length === 0) return [];

    const { relatedSourceHunchIds } = await recallRelevantPriors(rawText, candidates);
    return toPriors(candidates, relatedSourceHunchIds);
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/memory/recall.ts
git commit -m "feat: add prior recall orchestration"
```

---

### Task 6: Write the edge on conclusion (verdict route)

**Files:**
- Modify: `src/app/api/hunch/[id]/verdict/route.ts`

**Interfaces:**
- Consumes: `writeEdgeData` from `@/lib/memory/causal-graph`.
- Produces: the verdict transaction now also writes a `CausalEdge` (when the category is a finding).

Thin route change; verified live in this task. No route unit test.

- [ ] **Step 1: Import `writeEdgeData`**

In `src/app/api/hunch/[id]/verdict/route.ts`, add to the imports:

```ts
import { writeEdgeData } from "@/lib/memory/causal-graph";
```

- [ ] **Step 2: Build the edge input and add it to the transaction**

Find the existing transaction block (inside the `try` after the verdict is generated):

```ts
  try {
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
  } catch {
```

Replace it with (adds `edgeInput` + the conditional `causalEdge.create`):

```ts
  const edgeInput = writeEdgeData({
    category: verdict.category,
    effect: verdict.effect,
    pEffect: verdict.pEffect,
    statement: hunch.hypothesis.statement,
    outcomeMetric: hunch.hypothesis.outcomeMetric,
    hunchId: hunch.id,
    userId: session.user.id,
  });

  try {
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
      ...(edgeInput ? [db.causalEdge.create({ data: edgeInput })] : []),
    ]);
  } catch {
```

(Leave the rest of the `catch` block — the concurrent-create fallback — unchanged. The `@@unique` is on `Verdict.hunchId`, so a concurrent loser still lands in that fallback and serves the stored verdict; the edge is created exactly once alongside the winning verdict.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Live verification (edge is written on conclude)**

With Docker + dev server up (`docker compose up -d db && npm run dev`) and a real Better Auth session, seed a concluded hunch (protocol `startedAt` far enough in the past that the ABA schedule is `done`, ≥3 check-ins in each of the A and B arms, B clearly higher). Then:
- `GET /api/hunch/<id>/verdict` (first call) → `200`, category `helped`.
- Query the DB: `SELECT cause, effect, direction, confidence, "sourceHunchId" FROM "CausalEdge" WHERE "sourceHunchId" = '<id>';` → exactly one row, `direction = 'increases'`, `cause` = the hypothesis statement, `confidence` = the verdict's pEffect.
- Seed a second concluded hunch with an arm having < 3 check-ins → verdict `inconclusive_insufficient`; confirm **no** `CausalEdge` row for it.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/hunch/[id]/verdict/route.ts"
git commit -m "feat: write a causal edge when a trial concludes"
```

---

### Task 7: Register the memory agent + feed priors to the Coach

**Files:**
- Modify: `src/mastra/index.ts`
- Modify: `src/mastra/index.test.ts`
- Modify: `src/mastra/agents/hypothesis-coach.ts`

**Interfaces:**
- Consumes: `memory` from `@/mastra/agents/memory`; `Prior` from `@/lib/schemas/prior`.
- Produces: `memory` registered on the root Mastra instance; `sharpenHunch(rawText, priors?)` gains an optional `priors: Prior[]` context arg (prompt-only; output schema unchanged).

- [ ] **Step 1: Update the index test first (RED)**

In `src/mastra/index.test.ts`, add a memory assertion alongside the existing agent checks:

```ts
  expect(mastra.getAgentById("memory")).toBeDefined();
```

Run: `npm test -- src/mastra/index.test.ts`
Expected: FAIL — memory not registered.

- [ ] **Step 2: Register the memory agent (GREEN)**

In `src/mastra/index.ts`, add the import and register it:

```ts
import { memory } from "@/mastra/agents/memory";
```

and change the agents object to include `memory`:

```ts
export const mastra = new Mastra({
  agents: { hypothesisCoach, protocolDesigner, safetyReviewer, analyst, memory },
});
```

Run: `npm test -- src/mastra/index.test.ts`
Expected: PASS.

- [ ] **Step 3: Add the optional priors context to `sharpenHunch`**

In `src/mastra/agents/hypothesis-coach.ts`, add the import:

```ts
import type { Prior } from "@/lib/schemas/prior";
```

Replace the `sharpenHunch` function with a version that accepts optional priors and folds them into the prompt (output schema unchanged):

```ts
/**
 * Run the coach on a raw hunch and return a validated SharpenedHypothesis. When
 * the user has related past findings (Phase 6 recall), they are passed as
 * context so the coach can account for what is already known — it still outputs
 * only the sharpened hypothesis.
 */
export async function sharpenHunch(
  rawText: string,
  priors: Prior[] = [],
): Promise<SharpenedHypothesis> {
  const priorsBlock =
    priors.length > 0
      ? `\n\nThe user has already learned these related findings; take them into account, do not contradict them:\n${priors
          .map((p) => `- ${p.cause} (${p.direction}, ${Math.round(p.confidence * 100)}% confident)`)
          .join("\n")}`
      : "";

  const response = await hypothesisCoach.generate(
    `Sharpen this hunch into a testable hypothesis:\n\n"${rawText}"${priorsBlock}`,
    {
      structuredOutput: { schema: sharpenedHypothesisSchema },
      // The output is a small object; cap tokens to stay within budget and
      // avoid the provider's large default.
      modelSettings: { maxOutputTokens: 1024 },
    },
  );

  return sharpenedHypothesisSchema.parse(response.object);
}
```

- [ ] **Step 4: Full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS (existing `sharpenHunch(rawText)` callers still typecheck — `priors` defaults to `[]`).

- [ ] **Step 5: Commit**

```bash
git add src/mastra/index.ts src/mastra/index.test.ts src/mastra/agents/hypothesis-coach.ts
git commit -m "feat: register memory agent + feed priors to the coach"
```

---

### Task 8: Recall on hunch creation + surface on the card

**Files:**
- Modify: `src/app/api/hunch/route.ts`
- Modify: `src/hooks/use-create-hunch.ts`
- Modify: `src/components/hunch-card.tsx`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: `recallPriors` from `@/lib/memory/recall`; `Prior` from `@/lib/schemas/prior`.
- Produces: `POST /api/hunch` recalls priors, feeds them to `sharpenHunch`, and returns `{ hunch, priors }`; the hook surfaces `priors`; the card renders them.

- [ ] **Step 1: Wire recall into the POST route**

In `src/app/api/hunch/route.ts`, add the import:

```ts
import { recallPriors } from "@/lib/memory/recall";
```

Replace the block from `const sharpened = ...` through the final `return`:

```ts
  const priors = await recallPriors(session.user.id, parsed.data.rawText);
  const sharpened = await sharpenHunch(parsed.data.rawText, priors);

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
    },
    include: { hypothesis: true },
  });

  return NextResponse.json({ hunch, priors }, { status: 201 });
```

- [ ] **Step 2: Surface priors through the hook**

In `src/hooks/use-create-hunch.ts`, import `Prior`, add `priors` to the returned type, and read it from the response:

```ts
import type { SharpenedHypothesis } from "@/lib/schemas/hypothesis";
import type { Prior } from "@/lib/schemas/prior";

/** A persisted hunch with its sharpened hypothesis + any recalled priors. */
export type HunchWithHypothesis = {
  id: string;
  rawText: string;
  status: string;
  hypothesis: SharpenedHypothesis & { id: string };
  priors: Prior[];
};

async function postHunch(rawText: string): Promise<HunchWithHypothesis> {
  const res = await fetch("/api/hunch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawText }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error ?? "Something went wrong sharpening your hunch.");
  }
  return { ...body.hunch, priors: body.priors ?? [] } as HunchWithHypothesis;
}
```

(Leave `useCreateHunch` below unchanged.)

- [ ] **Step 3: Render priors on the Hunch Card**

In `src/components/hunch-card.tsx`, add a priors section before the closing `</article>` (after the `</dl>`):

```tsx
      {hunch.priors.length > 0 && (
        <div className="mt-5 border-t pt-4">
          <p className="text-sm font-medium text-muted-foreground">
            You already learned
          </p>
          <ul className="mt-2 space-y-1.5">
            {hunch.priors.map((p) => (
              <li key={p.sourceHunchId} className="text-sm">
                <span className="italic">{p.cause}</span>{" "}
                <span className="text-muted-foreground">
                  ({Math.round(p.confidence * 100)}% confident)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
```

- [ ] **Step 4: Full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 5: Live verification (recall surfaces on create)**

With Docker + dev server up and a real session that already has the caffeine→sleep `CausalEdge` from Task 6:
- `POST /api/hunch` with `{ "rawText": "does coffee in the afternoon ruin my sleep?" }` → `201`; the response `priors` array contains the caffeine finding (the agent matched "coffee"→"caffeine" past the lexical filter, or the lexical filter matched on "sleep"/"afternoon"); confirm `sourceHunchId` matches the earlier hunch.
- `POST /api/hunch` with an unrelated `{ "rawText": "does morning stretching reduce my back pain?" }` → `201` with `priors: []`.
- Confirm the Hunch Card renders the "You already learned" block for the first and nothing for the second.

- [ ] **Step 6: Record the ledger + commit**

Append a `## Phase 6` section to `.superpowers/sdd/progress.md` summarizing tasks, gates (typecheck + lint + unit test counts), and the live verification (edge written on conclude; recall surfaced on create; unrelated hunch surfaced nothing). Then:

```bash
git add src/app/api/hunch/route.ts src/hooks/use-create-hunch.ts src/components/hunch-card.tsx
git commit -m "feat: recall priors on hunch creation and surface on the card"
```

(`.superpowers/` is gitignored — the ledger update is local only, matching prior phases.)

---

### Task 9: Memory faithfulness eval (key-gated)

**Files:**
- Create: `src/mastra/agents/memory.eval.test.ts`

**Interfaces:**
- Consumes: `recallRelevantPriors` from `@/mastra/agents/memory`; `CausalEdge` from `@/generated/prisma/client`.
- Produces: a `test:eval`-suite test (self-skips without `OPENROUTER_API_KEY`) asserting the agent selects related findings, skips unrelated ones, and never invents an id.

- [ ] **Step 1: Write the eval**

Create `src/mastra/agents/memory.eval.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { recallRelevantPriors } from "@/mastra/agents/memory";
import type { CausalEdge } from "@/generated/prisma/client";

const hasKey = Boolean(process.env.OPENROUTER_API_KEY);

const edge = (over: Partial<CausalEdge>): CausalEdge => ({
  id: "e", userId: "u", cause: "", effect: "", direction: "increases",
  effectSize: 1, confidence: 0.9, sourceHunchId: "h", createdAt: new Date(),
  ...over,
});

const caffeine = edge({
  sourceHunchId: "h_caf",
  cause: "Cutting afternoon caffeine increases nightly sleep duration.",
  effect: "hours of sleep from a tracker",
});
const desk = edge({
  sourceHunchId: "h_desk",
  cause: "A standing desk improves afternoon focus.",
  effect: "focus rated 1-10",
});

/**
 * Memory faithfulness eval: the agent must recall a genuinely-related past
 * finding, skip unrelated ones, and only ever return ids it was given. Self-skips
 * without OPENROUTER_API_KEY.
 */
describe.skipIf(!hasKey)("Memory recall quality", () => {
  test("recalls a related past finding (coffee ~ caffeine)", async () => {
    const { relatedSourceHunchIds } = await recallRelevantPriors(
      "does drinking coffee in the afternoon wreck my sleep?",
      [caffeine, desk],
    );
    expect(relatedSourceHunchIds).toContain("h_caf");
    expect(relatedSourceHunchIds).not.toContain("h_desk");
  }, 60_000);

  test("recalls nothing for an unrelated hunch and never invents ids", async () => {
    const { relatedSourceHunchIds } = await recallRelevantPriors(
      "does morning stretching reduce my back pain?",
      [caffeine, desk],
    );
    // Only ever ids from the candidate set.
    for (const id of relatedSourceHunchIds) {
      expect(["h_caf", "h_desk"]).toContain(id);
    }
    expect(relatedSourceHunchIds).not.toContain("h_caf");
  }, 60_000);
});
```

- [ ] **Step 2: Run the eval (with a key if available)**

Run: `npm run test:eval -- src/mastra/agents/memory.eval.test.ts`
Expected: PASS if `OPENROUTER_API_KEY` is set; SKIPPED otherwise (report which). If it runs and an assertion fails, that is a real faithfulness finding — report it, don't weaken the assertion.

- [ ] **Step 3: Confirm the normal suite is unaffected**

Run: `npm test`
Expected: all PASS (the eval file is excluded from the normal suite by config).

- [ ] **Step 4: Commit**

```bash
git add src/mastra/agents/memory.eval.test.ts
git commit -m "test: add memory recall faithfulness eval"
```

---

## Self-Review

**Spec coverage:**
- Surface-only priors (engine untouched) → Tasks 5, 7, 8 (no engine files touched). ✓
- Recall = deterministic pre-filter → LLM relevance → Task 3 (`selectCandidatePriors`) + Task 4 (`memory` agent) + Task 5 (orchestration). ✓
- Edges written on conclude for helped/hurt/no_effect, none for insufficient, atomically → Task 2 (`writeEdgeData`) + Task 6 (transaction). ✓
- Edge fields derived from stored data, no write-time LLM → Task 2. ✓
- Recall additive / never blocks creation → Task 5 (`try/catch → []`), Task 8 (route calls it before create). ✓
- Invented-id defense in pure code → Task 3 (`toPriors` filters to candidate set). ✓
- Surface on card + feed to coach → Task 7 (`sharpenHunch` priors) + Task 8 (route returns priors, card renders). ✓
- Memory registered on Mastra instance → Task 7. ✓
- Memory faithfulness eval (key-gated) → Task 9. ✓
- No schema/migration work (CausalEdge already migrated) → Global Constraints; no task edits `schema.prisma`. ✓

**Intentional deviation from spec:** the spec's `recallResultSchema` mentioned an optional one-line `note`; the plan drops it (YAGNI). The card renders each recalled finding from structured data (the `cause` statement + confidence), so no LLM prose is stored or shown on the memory surface — keeping the surface faithful to the numbers and removing an unused field. The agent's output is purely the selected ids.

**Placeholder scan:** No TBD/TODO; every code step has full code. ✓

**Type consistency:** `Prior` (Task 1) is produced by `toPriors` (Task 3), returned by `recallPriors` (Task 5), consumed by `sharpenHunch` (Task 7) and the card (Task 8). `CausalEdgeInput` (Task 2) is returned by `writeEdgeData` and spread into `db.causalEdge.create({ data })` (Task 6). `recallResultSchema`/`RecallResult` (Task 1) is returned by `recallRelevantPriors` (Task 4), consumed by `recallPriors` (Task 5). `readEdges` (Task 2) → `selectCandidatePriors` (Task 3) → `recallRelevantPriors` (Task 4) → `toPriors` (Task 3) chain types line up on `CausalEdge`. `sharpenHunch(rawText, priors?)` keeps its existing single-arg callers valid via the `= []` default (Task 7). ✓
