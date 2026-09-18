# Pre-designed Plans — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Design a hunch's plan in the background right after it is sharpened, so pressing confirm on the plan page returns a stored design instead of waiting on the Protocol Designer and Safety Reviewer.

**Architecture:** Both sharpen routes schedule `predesign(hunchId)` with Next's `after()`. It runs the unchanged `designProtocol` and stores the result in a new `DesignDraft` row keyed by a fingerprint of the design's inputs. The protocol route computes the same fingerprint from what the user confirmed, takes a matching draft (waiting briefly if one is still being designed), and otherwise designs inline exactly as today. The draft is deleted in the protocol transaction.

**Tech Stack:** Next.js 16 App Router (`after` from `next/server`), Prisma/Postgres, Zod v4, Mastra agents, Vitest, Node `crypto` and `async_hooks`.

**Spec:** `docs/superpowers/specs/2026-09-17-predesign-draft-design.md`

## Global Constraints

- **The inline design path stays whole.** A missing, stale, failed or slow draft falls back to today's `designProtocol` call with today's arguments. No task may make confirm fail because of a draft.
- **Drafts are invisible until confirmed.** Nothing but `takeDraft` and `predesign` reads `DesignDraft`. No `Protocol` row is written before confirm.
- **`resolveSafetyState` runs at confirm time** on the stored raw verdict, never at draft time.
- **Wait cap 12 000ms, poll every 250ms, a `designing` row older than 30 000ms is stale.** Exact values. The cap stays above one design's measured cost (~7.4s after the slim designer), so a wait ends when the draft arrives rather than timing out and designing inline anyway.
- **Fingerprint = sha256 hex** of `DESIGN_VERSION`, statement, outcomeMetric, outcomeType, confounderNames, shape, and — for `observational` only — the trimmed exposure label. The tracker list is never an input.
- **Bump `DESIGN_VERSION`** in any later change to a design prompt, a design model, or the code that assembles a design. Fix #4 (slim designer, currently uncommitted) counts: if it lands after this plan ships, it bumps the version.
- **Test-first** (RULES.md §3). All tests here mock the model and the DB; no task needs OpenRouter credits except Task 8.
- **No new dependencies** (RULES.md §1).
- **After any `prisma/schema.prisma` change:** `npx prisma generate`, then `rm -rf .next`, then restart the dev server. The client has a custom output path (`src/generated/prisma`) and Turbopack caches the old one.
- **The owner commits** (RULES.md §2). Each task ends green — `npm test`, `npm run typecheck`, `npm run lint` — and reports "ready to commit" with the Conventional Commits message given. **No commit trailers.**

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/timing.ts` (modify) | add `untimed` — run work outside the request's timing record |
| `src/lib/design-draft/fingerprint.ts` (create) | `DESIGN_VERSION`, `designInputFor`, `designFingerprint` — pure |
| `src/lib/design-draft/take.ts` (create) | `takeDraft` — read, wait on, and validate a draft |
| `src/lib/design-draft/predesign.ts` (create) | `predesign` — design in the background and store the draft |
| `prisma/schema.prisma` (modify) + migration (create) | `DesignDraft` table |
| `src/app/api/hunch/[id]/protocol/route.ts` (modify) | use a draft on confirm; consume it |
| `src/app/api/hunch/route.ts`, `src/app/api/hunch/[id]/sharpen/route.ts` (modify) | schedule `predesign` |
| `scripts/bench-hunch-flow.ts` (modify) | `--read-pause`, draft outcome on W3 |

---

### Task 1: `untimed`

**Files:**
- Modify: `src/lib/timing.ts` (after `timed`, ~line 97)
- Test: `src/lib/timing.test.ts`

**Interfaces:**
- Produces: `export function untimed<T>(fn: () => T): T` — runs `fn` with no timing record active; promises it starts stay outside the record.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/timing.test.ts`, and add `untimed` to its import from `./timing`:

```ts
describe("untimed", () => {
  it("keeps a step started inside it off the enclosing request's header", async () => {
    vi.stubEnv("HUNCH_TIMING", "1");
    const out = await withTiming(async () => {
      await timed("inline", async () => 1);
      await untimed(() => timed("background", async () => 2));
      return json({});
    })();

    const names = parseServerTiming(out.headers.get("Server-Timing")).map((e) => e.name);
    expect(names).toContain("inline");
    expect(names).not.toContain("background");
  });

  it("returns what the function returns", async () => {
    await expect(untimed(async () => 42)).resolves.toBe(42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/timing.test.ts`
Expected: FAIL — `untimed` is not exported (`TypeError: untimed is not a function`, or a TS import error).

- [ ] **Step 3: Implement**

In `src/lib/timing.ts`, directly after the `timed` function:

```ts
/**
 * Run work that outlives the request — an `after()` callback — with no timing
 * record active. Such a callback inherits the request's async context, so
 * without this its `timed` steps would be pushed into a record whose
 * `Server-Timing` header has already gone out.
 */
export function untimed<T>(fn: () => T): T {
  return requests.exit(fn);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/timing.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Gate and hand off**

Run: `npm test && npm run typecheck && npm run lint` — all green.
Report ready to commit: `perf(timing): untimed, for work that outlives the request`

---

### Task 2: The fingerprint

**Files:**
- Create: `src/lib/design-draft/fingerprint.ts`
- Test: `src/lib/design-draft/fingerprint.test.ts`

**Interfaces:**
- Consumes: `designProtocol` input type from `src/mastra/workflows/design.ts` (type-only import); `engineOutcomeType` from `src/lib/parameters.ts`.
- Produces:
  - `export const DESIGN_VERSION: number`
  - `export type DesignInput = Parameters<typeof designProtocol>[0]`
  - `export function designInputFor(hypothesis: { statement: string; outcomeMetric: string; outcomeType: string; confounders: string[] }, choice: { schedulable: boolean; exposureLabel?: string }): DesignInput`
  - `export function designFingerprint(input: DesignInput): string` — 64-char lowercase hex

- [ ] **Step 1: Write the failing tests**

Create `src/lib/design-draft/fingerprint.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { designFingerprint, designInputFor, type DesignInput } from "./fingerprint";

const hypothesis = {
  statement: "Coffee after 2pm costs me sleep.",
  outcomeMetric: "hours of sleep",
  outcomeType: "continuous",
  confounders: ["alcohol", "stress"],
};

describe("designInputFor", () => {
  it("builds a phased input with no exposure label", () => {
    expect(designInputFor(hypothesis, { schedulable: true, exposureLabel: "had coffee" })).toEqual({
      statement: "Coffee after 2pm costs me sleep.",
      outcomeMetric: "hours of sleep",
      outcomeType: "continuous",
      confounderNames: ["alcohol", "stress"],
      shape: "phased",
      exposureLabel: undefined,
    });
  });

  it("builds an observational input carrying the trimmed exposure label", () => {
    const input = designInputFor(hypothesis, { schedulable: false, exposureLabel: "  played basketball " });
    expect(input.shape).toBe("observational");
    expect(input.exposureLabel).toBe("played basketball");
  });

  it("maps a stored outcome type onto the engine's two", () => {
    expect(designInputFor({ ...hypothesis, outcomeType: "amount" }, { schedulable: true }).outcomeType).toBe(
      "continuous",
    );
  });
});

describe("designFingerprint", () => {
  const phased = designInputFor(hypothesis, { schedulable: true });
  const observational = designInputFor(hypothesis, { schedulable: false, exposureLabel: "played basketball" });

  it("is a sha256 hex digest, equal for equal inputs", () => {
    const fp = designFingerprint(phased);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(designFingerprint({ ...phased, confounderNames: [...phased.confounderNames] })).toBe(fp);
  });

  it.each<[string, Partial<DesignInput>]>([
    ["statement", { statement: "Coffee after noon costs me sleep." }],
    ["outcomeMetric", { outcomeMetric: "sleep quality 1-5" }],
    ["outcomeType", { outcomeType: "binary" }],
    ["confounderNames", { confounderNames: ["alcohol"] }],
    ["shape", { shape: "observational" }],
  ])("changes when %s changes", (_field, change) => {
    expect(designFingerprint({ ...phased, ...change })).not.toBe(designFingerprint(phased));
  });

  it("ignores the exposure label on a phased design", () => {
    expect(designFingerprint({ ...phased, exposureLabel: "had coffee" })).toBe(designFingerprint(phased));
  });

  it("counts the exposure label on an observational design, ignoring surrounding whitespace", () => {
    expect(designFingerprint({ ...observational, exposureLabel: "went to the gym" })).not.toBe(
      designFingerprint(observational),
    );
    expect(designFingerprint({ ...observational, exposureLabel: " played basketball  " })).toBe(
      designFingerprint(observational),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/design-draft/fingerprint.test.ts`
Expected: FAIL — `Failed to resolve import "./fingerprint"`.

- [ ] **Step 3: Implement**

Create `src/lib/design-draft/fingerprint.ts`:

```ts
import { createHash } from "node:crypto";
import { engineOutcomeType } from "@/lib/parameters";
import type { designProtocol } from "@/mastra/workflows/design";

/**
 * Which logic made a design. Bump it whenever a design prompt, a design model,
 * or the code that assembles a design changes (src/mastra/agents/
 * protocol-designer.ts, safety-reviewer.ts, src/mastra/workflows/design.ts), so
 * a draft made by older logic is never served. Lives here rather than beside
 * `designProtocol` so this module stays free of the agents.
 */
export const DESIGN_VERSION = 1;

export type DesignInput = Parameters<typeof designProtocol>[0];

/**
 * The one way to turn a stored hypothesis plus the shape choice into the
 * design workflow's input. `predesign` calls it from stored rows and the
 * protocol route from what the user confirmed; sharing it is what makes their
 * fingerprints agree.
 */
export function designInputFor(
  hypothesis: { statement: string; outcomeMetric: string; outcomeType: string; confounders: string[] },
  choice: { schedulable: boolean; exposureLabel?: string },
): DesignInput {
  const observational = !choice.schedulable;
  return {
    statement: hypothesis.statement,
    outcomeMetric: hypothesis.outcomeMetric,
    outcomeType: engineOutcomeType(hypothesis.outcomeType),
    confounderNames: hypothesis.confounders,
    shape: observational ? "observational" : "phased",
    // A phased design never reads the label; leaving it out keeps a renamed
    // adherence tracker from invalidating a draft it doesn't affect.
    exposureLabel: observational ? choice.exposureLabel?.trim() : undefined,
  };
}

/**
 * Everything a design depends on, hashed. The tracker list is deliberately not
 * an input: editing trackers on the confirm gate changes no design.
 */
export function designFingerprint(input: DesignInput): string {
  const shape = input.shape ?? "phased";
  const canonical = JSON.stringify([
    DESIGN_VERSION,
    input.statement,
    input.outcomeMetric,
    input.outcomeType,
    input.confounderNames,
    shape,
    shape === "observational" ? (input.exposureLabel ?? "").trim() : null,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/design-draft/fingerprint.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Gate and hand off**

Run: `npm test && npm run typecheck && npm run lint` — all green.
Report ready to commit: `feat(design-draft): fingerprint a design's inputs`

---

### Task 3: The `DesignDraft` table and `takeDraft`

**Files:**
- Modify: `prisma/schema.prisma` (model `Hunch` ~line 24; new model after `Protocol` ~line 68)
- Create: `prisma/migrations/20260917120000_design_draft/migration.sql`
- Create: `src/lib/design-draft/take.ts`
- Test: `src/lib/design-draft/take.test.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/db`; `designResultSchema`, `DesignResult` from `@/lib/schemas/protocol`.
- Produces:
  - Prisma model `DesignDraft { hunchId String @id; fingerprint String; status String; result Json?; updatedAt DateTime }`, relation `Hunch.designDraft`
  - `export const DRAFT_WAIT_MS = 12_000`, `DRAFT_POLL_MS = 250`, `DRAFT_STALE_MS = 30_000`
  - `export async function takeDraft(hunchId: string, fingerprint: string): Promise<DesignResult | null>`

- [ ] **Step 1: Add the model**

In `prisma/schema.prisma`, inside `model Hunch`, after `verdict    Verdict?`:

```prisma
  designDraft DesignDraft?
```

After `model Protocol { ... }`:

```prisma
/// A plan designed in the background after sharpening, before the user
/// confirms. Invisible until then: only the protocol route's `takeDraft`
/// reads it, and it is deleted when a Protocol is written.
model DesignDraft {
  hunchId     String   @id
  fingerprint String // designFingerprint of the inputs it was designed from
  status      String // designing | ready | failed
  result      Json? // DesignResult: confounders, design, powerInfo, raw safety verdict
  updatedAt   DateTime @updatedAt

  hunch Hunch @relation(fields: [hunchId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2: Add the migration**

Create `prisma/migrations/20260917120000_design_draft/migration.sql`:

```sql
-- CreateTable
CREATE TABLE "DesignDraft" (
    "hunchId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "result" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignDraft_pkey" PRIMARY KEY ("hunchId")
);

-- AddForeignKey
ALTER TABLE "DesignDraft" ADD CONSTRAINT "DesignDraft_hunchId_fkey" FOREIGN KEY ("hunchId") REFERENCES "Hunch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Run: `npm run db:up && npx prisma migrate dev && npx prisma generate && rm -rf .next`
Expected: "Your database is now in sync with your schema." and no new migration generated (if Prisma proposes a second migration, the SQL above differs from the schema — make them match rather than accepting it).

- [ ] **Step 3: Write the failing tests**

Create `src/lib/design-draft/take.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { designDraft: { findUnique: vi.fn() } } }));

import { takeDraft } from "./take";
import { db } from "@/lib/db";
import type { DesignResult } from "@/lib/schemas/protocol";

const findUnique = vi.mocked(db.designDraft.findUnique);
const NOW = new Date("2026-09-17T10:00:00Z");

const RESULT: DesignResult = {
  confounders: [],
  design: {
    phases: [{ label: "A", kind: "baseline", days: 21, name: "Just live normally", action: "Live normally." }],
    washoutDays: 0,
    controls: [],
    instructions: "Live normally and log both questions.",
    shape: "observational",
  },
  powerInfo: { minDaysPerPhase: 7, effectSize: "medium", rationale: "a medium effect" },
  safety: { state: "approved", reason: "Low-risk lifestyle change.", routedToDoctor: false },
};

const row = (over: Record<string, unknown>) =>
  ({ hunchId: "h1", fingerprint: "fp", status: "ready", result: RESULT, updatedAt: NOW, ...over }) as never;

describe("takeDraft", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    findUnique.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when there is no draft", async () => {
    findUnique.mockResolvedValue(null);
    await expect(takeDraft("h1", "fp")).resolves.toBeNull();
  });

  it("returns null when the draft was designed from other inputs", async () => {
    findUnique.mockResolvedValue(row({ fingerprint: "other" }));
    await expect(takeDraft("h1", "fp")).resolves.toBeNull();
  });

  it("returns a ready draft's result", async () => {
    findUnique.mockResolvedValue(row({}));
    await expect(takeDraft("h1", "fp")).resolves.toEqual(RESULT);
    expect(findUnique).toHaveBeenCalledWith({ where: { hunchId: "h1" } });
  });

  it("returns null when a ready draft's result doesn't parse", async () => {
    findUnique.mockResolvedValue(row({ result: { design: "not a design" } }));
    await expect(takeDraft("h1", "fp")).resolves.toBeNull();
  });

  it("returns null for a failed draft", async () => {
    findUnique.mockResolvedValue(row({ status: "failed", result: null }));
    await expect(takeDraft("h1", "fp")).resolves.toBeNull();
  });

  it("waits for a draft still being designed", async () => {
    const designing = row({ status: "designing", result: null });
    findUnique.mockResolvedValueOnce(designing).mockResolvedValueOnce(designing).mockResolvedValue(row({}));

    const taken = takeDraft("h1", "fp");
    await vi.advanceTimersByTimeAsync(500);

    await expect(taken).resolves.toEqual(RESULT);
    expect(findUnique).toHaveBeenCalledTimes(3);
  });

  it("gives up after 3s on a draft that never finishes", async () => {
    findUnique.mockResolvedValue(row({ status: "designing", result: null }));

    const taken = takeDraft("h1", "fp");
    await vi.advanceTimersByTimeAsync(3_250);

    await expect(taken).resolves.toBeNull();
  });

  it("doesn't wait on a designing row older than 30s — its work was cut off", async () => {
    findUnique.mockResolvedValue(
      row({ status: "designing", result: null, updatedAt: new Date(NOW.getTime() - 31_000) }),
    );

    await expect(takeDraft("h1", "fp")).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npx vitest run src/lib/design-draft/take.test.ts`
Expected: FAIL — `Failed to resolve import "./take"`.

- [ ] **Step 5: Implement**

Create `src/lib/design-draft/take.ts`:

```ts
import { db } from "@/lib/db";
import { designResultSchema, type DesignResult } from "@/lib/schemas/protocol";

/**
 * Longest confirm waits on a draft still being designed. Kept under one
 * design's cost — a cap above that turns a near-miss into a double wait.
 */
export const DRAFT_WAIT_MS = 12_000;
/** How often it looks again while waiting. */
export const DRAFT_POLL_MS = 250;
/** A `designing` row this old was cut off (a killed `after()`), not slow. */
export const DRAFT_STALE_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The background design for this hunch, if it was made from the same inputs
 * the user just confirmed. Waits on one still in flight — it started earlier,
 * so waiting never costs more than designing inline would. Null means "design
 * it now": no draft, other inputs, failed, stale, unreadable, or not done in
 * time. It never throws on a draft's account.
 */
export async function takeDraft(hunchId: string, fingerprint: string): Promise<DesignResult | null> {
  const deadline = Date.now() + DRAFT_WAIT_MS;
  for (;;) {
    const row = await db.designDraft.findUnique({ where: { hunchId } });
    if (!row || row.fingerprint !== fingerprint) return null;

    if (row.status === "ready") {
      const parsed = designResultSchema.safeParse(row.result);
      return parsed.success ? parsed.data : null;
    }
    if (row.status !== "designing") return null;
    if (Date.now() - row.updatedAt.getTime() > DRAFT_STALE_MS) return null;
    if (Date.now() >= deadline) return null;

    await sleep(DRAFT_POLL_MS);
  }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/lib/design-draft/take.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 7: Gate and hand off**

Run: `npm test && npm run typecheck && npm run lint` — all green.
Report ready to commit: `feat(design-draft): store background designs and take one on confirm`

---

### Task 4: `predesign`

**Files:**
- Create: `src/lib/design-draft/predesign.ts`
- Test: `src/lib/design-draft/predesign.test.ts`

**Interfaces:**
- Consumes: `designInputFor`, `designFingerprint` (Task 2); `db.designDraft` (Task 3); `designProtocol` from `@/mastra/workflows/design`; `Prisma` from `@/generated/prisma/client`.
- Produces: `export async function predesign(hunchId: string): Promise<void>` — never rejects.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/design-draft/predesign.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    hunch: { findUnique: vi.fn() },
    designDraft: { upsert: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/mastra/workflows/design", () => ({ designProtocol: vi.fn() }));

import { predesign } from "./predesign";
import { designFingerprint, designInputFor } from "./fingerprint";
import { db } from "@/lib/db";
import { designProtocol } from "@/mastra/workflows/design";

const hypothesis = {
  statement: "Playing basketball makes my knee hurt.",
  outcomeMetric: "knee pain 1-10",
  outcomeType: "continuous",
  confounders: ["stairs"],
  schedulable: true,
};
const exposure = { label: "played basketball", isExposure: true, isPrimary: false };
const primary = { label: "knee pain 1-10", isExposure: false, isPrimary: true };
const hunch = (over: Record<string, unknown> = {}) =>
  ({ id: "h1", hypothesis, parameters: [primary], ...over }) as never;

const result = { design: { shape: "phased" } };

describe("predesign", () => {
  beforeEach(() => {
    // reset, not clear: one test makes the upsert reject, and a cleared mock
    // would keep rejecting in every test after it.
    vi.resetAllMocks();
    vi.mocked(designProtocol).mockResolvedValue(result as never);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("marks the draft designing, designs, then stores the result under the same fingerprint", async () => {
    vi.mocked(db.hunch.findUnique).mockResolvedValue(hunch());
    const input = designInputFor(hypothesis, { schedulable: true });
    const fingerprint = designFingerprint(input);

    await predesign("h1");

    expect(db.designDraft.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { hunchId: "h1" },
        create: { hunchId: "h1", fingerprint, status: "designing" },
        update: expect.objectContaining({ fingerprint, status: "designing" }),
      }),
    );
    expect(designProtocol).toHaveBeenCalledWith(input);
    expect(db.designDraft.updateMany).toHaveBeenCalledWith({
      where: { hunchId: "h1", fingerprint },
      data: { status: "ready", result },
    });
  });

  it("designs an observational window from the stored exposure label", async () => {
    vi.mocked(db.hunch.findUnique).mockResolvedValue(
      hunch({ hypothesis: { ...hypothesis, schedulable: false }, parameters: [primary, exposure] }),
    );

    await predesign("h1");

    expect(designProtocol).toHaveBeenCalledWith(
      expect.objectContaining({ shape: "observational", exposureLabel: "played basketball" }),
    );
  });

  it("does nothing for an observational hunch with no named daily yes/no", async () => {
    vi.mocked(db.hunch.findUnique).mockResolvedValue(
      hunch({ hypothesis: { ...hypothesis, schedulable: false }, parameters: [primary] }),
    );

    await predesign("h1");

    expect(db.designDraft.upsert).not.toHaveBeenCalled();
    expect(designProtocol).not.toHaveBeenCalled();
  });

  it("does nothing for a hunch that is gone or has no hypothesis", async () => {
    vi.mocked(db.hunch.findUnique).mockResolvedValue(null);
    await predesign("h1");
    vi.mocked(db.hunch.findUnique).mockResolvedValue(hunch({ hypothesis: null }));
    await predesign("h1");

    expect(designProtocol).not.toHaveBeenCalled();
  });

  it("stores failed, and does not reject, when the design throws", async () => {
    vi.mocked(db.hunch.findUnique).mockResolvedValue(hunch());
    vi.mocked(designProtocol).mockRejectedValue(new Error("402 out of credits"));

    await expect(predesign("h1")).resolves.toBeUndefined();

    expect(db.designDraft.updateMany).toHaveBeenCalledWith({
      where: { hunchId: "h1", fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) },
      data: { status: "failed" },
    });
  });

  it("does not reject when the database does", async () => {
    vi.mocked(db.hunch.findUnique).mockResolvedValue(hunch());
    vi.mocked(db.designDraft.upsert).mockRejectedValue(new Error("foreign key: hunch deleted"));

    await expect(predesign("h1")).resolves.toBeUndefined();
    expect(designProtocol).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/design-draft/predesign.test.ts`
Expected: FAIL — `Failed to resolve import "./predesign"`.

- [ ] **Step 3: Implement**

Create `src/lib/design-draft/predesign.ts`:

```ts
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { designProtocol } from "@/mastra/workflows/design";
import { designFingerprint, designInputFor } from "./fingerprint";

/**
 * Design a freshly sharpened hunch's plan while the user reads the confirm
 * gate, and store it for `takeDraft`. Scheduled with `after()` by the sharpen
 * routes, so nothing is waiting on it and nothing may reach its caller: every
 * failure is logged and, where a row exists, recorded as `failed`. Confirm
 * designs inline whenever this didn't produce a matching draft.
 */
export async function predesign(hunchId: string): Promise<void> {
  try {
    const hunch = await db.hunch.findUnique({
      where: { id: hunchId },
      include: { hypothesis: true, parameters: true },
    });
    if (!hunch?.hypothesis) return;

    const { schedulable } = hunch.hypothesis;
    const exposureLabel = hunch.parameters.find((p) => p.isExposure)?.label.trim();
    // The user names the daily yes/no on the gate; until then there is no
    // observational design to make.
    if (!schedulable && !exposureLabel) return;

    const input = designInputFor(hunch.hypothesis, { schedulable, exposureLabel });
    const fingerprint = designFingerprint(input);

    await db.designDraft.upsert({
      where: { hunchId },
      create: { hunchId, fingerprint, status: "designing" },
      update: { fingerprint, status: "designing", result: Prisma.DbNull },
    });

    let data: { status: "ready"; result: Prisma.InputJsonValue } | { status: "failed" };
    try {
      data = { status: "ready", result: (await designProtocol(input)) as Prisma.InputJsonValue };
    } catch (err) {
      console.error("[predesign] failed:", err);
      data = { status: "failed" };
    }

    // Guarded by the fingerprint: a re-sharpen that started a newer design
    // while this one ran owns the row now, and this write matches nothing.
    await db.designDraft.updateMany({ where: { hunchId, fingerprint }, data });
  } catch (err) {
    console.error("[predesign] failed:", err);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/design-draft/predesign.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Gate and hand off**

Run: `npm test && npm run typecheck && npm run lint` — all green.
Report ready to commit: `feat(design-draft): design a sharpened hunch's plan in the background`

---

### Task 5: Confirm uses the draft

**Files:**
- Modify: `src/app/api/hunch/[id]/protocol/route.ts` (the `designProtocol` call inside `try`, and the transaction)
- Test: `src/app/api/hunch/[id]/protocol/route.test.ts`

**Interfaces:**
- Consumes: `designInputFor`, `designFingerprint` (Task 2); `takeDraft` (Task 3); `timed` from `@/lib/timing`.
- Produces: nothing new; response body unchanged.

- [ ] **Step 1: Write the failing tests**

In `src/app/api/hunch/[id]/protocol/route.test.ts`:

1. Add beside the other `vi.mock` calls:

```ts
vi.mock("@/lib/design-draft/take", () => ({ takeDraft: vi.fn(async () => null) }));
```

2. In the `tx` object inside the `@/lib/db` mock, add:

```ts
    designDraft: { deleteMany: vi.fn() },
```

3. Add to the imports:

```ts
import { takeDraft } from "@/lib/design-draft/take";
import { designFingerprint, designInputFor } from "@/lib/design-draft/fingerprint";
```

4. In `beforeEach`, after `vi.clearAllMocks();`, add `vi.mocked(takeDraft).mockResolvedValue(null);`.

5. Add these tests inside the `describe`:

```ts
  it("uses a draft designed from the same inputs instead of designing again", async () => {
    const drafted = {
      design: { phases: [], washoutDays: 0, controls: [], instructions: "drafted", shape: "phased" },
      powerInfo: {},
      confounders: [],
      safety: { state: "approved", reason: "r", routedToDoctor: false },
    };
    vi.mocked(takeDraft).mockResolvedValue(drafted as never);

    const res = await POST(req({ parameters: [primary] }), params);

    expect(res.status).toBe(201);
    expect(designProtocol).not.toHaveBeenCalled();
    expect(takeDraft).toHaveBeenCalledWith(
      "h1",
      designFingerprint(designInputFor(sharpened.hypothesis, { schedulable: true })),
    );
    expect(tx.protocol.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ design: drafted.design }) }),
    );
  });

  it("looks for the draft of the shape and label the user confirmed", async () => {
    await POST(req({ parameters: [primary, exposure], schedulable: false }), params);

    expect(takeDraft).toHaveBeenCalledWith(
      "h1",
      designFingerprint(
        designInputFor(sharpened.hypothesis, { schedulable: false, exposureLabel: "played basketball" }),
      ),
    );
  });

  it("designs inline when there is no usable draft", async () => {
    const res = await POST(req({ parameters: [primary] }), params);

    expect(res.status).toBe(201);
    expect(designProtocol).toHaveBeenCalledWith(expect.objectContaining({ shape: "phased" }));
  });

  it("consumes the draft in the same transaction that saves the protocol", async () => {
    await POST(req({ parameters: [primary] }), params);

    expect(tx.designDraft.deleteMany).toHaveBeenCalledWith({ where: { hunchId: "h1" } });
  });

  it("doesn't look for a draft once days are logged", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({ ...sharpened, _count: { checkIns: 2 } } as never);

    await POST(req({ parameters: [primary] }), params);

    expect(takeDraft).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run "src/app/api/hunch/[id]/protocol"`
Expected: FAIL — "uses a draft…" (designProtocol was called), "looks for the draft…" and "consumes the draft…" (takeDraft / deleteMany not called). "designs inline…" and "doesn't look for a draft…" pass already; they pin existing behaviour.

- [ ] **Step 3: Implement**

In `src/app/api/hunch/[id]/protocol/route.ts`:

Imports — add:

```ts
import { designFingerprint, designInputFor } from "@/lib/design-draft/fingerprint";
import { takeDraft } from "@/lib/design-draft/take";
```

Replace the `designProtocol({ ... })` call at the top of the `try` block:

```ts
    const result = await designProtocol({
      statement: hunch.hypothesis.statement,
      outcomeMetric: hunch.hypothesis.outcomeMetric,
      outcomeType: engineOutcomeType(hunch.hypothesis.outcomeType),
      confounderNames: hunch.hypothesis.confounders,
      shape: observational ? "observational" : "phased",
      exposureLabel: exposure?.label,
    });
```

with:

```ts
    // The same builder `predesign` uses, so a background design of these exact
    // inputs has this exact fingerprint. No usable draft: design now, as ever.
    const input = designInputFor(hunch.hypothesis, { schedulable, exposureLabel: exposure?.label });
    const result =
      (await timed("draft", () => takeDraft(hunch.id, designFingerprint(input)))) ??
      (await designProtocol(input));
```

Inside `db.$transaction(async (tx) => { ... })`, before `const saved = await tx.protocol.upsert(`:

```ts
      // A draft is used once. "Try again" or a later redesign starts fresh
      // rather than replaying a stored safety verdict.
      await tx.designDraft.deleteMany({ where: { hunchId: hunch.id } });
```

If `engineOutcomeType` is no longer used in this file, remove it from the `@/lib/parameters` import (lint will flag it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run "src/app/api/hunch/[id]/protocol"`
Expected: PASS, every test in the file including the existing 16.

- [ ] **Step 5: Gate and hand off**

Run: `npm test && npm run typecheck && npm run lint` — all green.
Report ready to commit: `perf(protocol): confirm uses the plan designed in the background`

---

### Task 6: Sharpening schedules the design

**Files:**
- Modify: `src/app/api/hunch/route.ts`, `src/app/api/hunch/[id]/sharpen/route.ts`
- Test: `src/app/api/hunch/route.test.ts`, `src/app/api/hunch/[id]/sharpen/route.test.ts`

**Interfaces:**
- Consumes: `predesign` (Task 4); `untimed` (Task 1); `after` from `next/server`.

- [ ] **Step 1: Write the failing tests — create route**

In `src/app/api/hunch/route.test.ts`, add beside the other mocks:

```ts
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/design-draft/predesign", () => ({ predesign: vi.fn() }));
```

Add to the imports:

```ts
import { after } from "next/server";
import { predesign } from "@/lib/design-draft/predesign";
```

Add inside the `describe`:

```ts
  it("starts designing the new hunch's plan once it is saved", async () => {
    vi.mocked(sharpenHunch).mockResolvedValue({
      statement: "Coffee after lunch makes me sleep worse.",
      outcomeMetric: "hours of sleep from a tracker",
      outcomeType: "continuous",
      subject: "self",
      confounders: [],
      trackers: [],
      schedulable: true,
    });
    vi.mocked(db.hunch.create).mockResolvedValue({ id: "h1", parameters: [] } as never);

    await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));

    expect(after).toHaveBeenCalledTimes(1);
    // `after` also accepts a promise; the routes always pass a function.
    const scheduled = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
    await scheduled();
    expect(predesign).toHaveBeenCalledWith("h1");
  });

  it("designs nothing ahead for a hunch kept as a log", async () => {
    vi.mocked(sharpenHunch).mockResolvedValue({
      statement: "I feel more tired on some days than others.",
      outcomeMetric: "tiredness rated 1-5",
      outcomeType: "continuous",
      subject: "self",
      confounders: [],
      trackers: [],
    } as never);
    vi.mocked(db.hunch.create).mockResolvedValue({ id: "h1", parameters: [] } as never);

    await POST(req({ rawText: "am I tired", observeOnly: true }));

    expect(after).not.toHaveBeenCalled();
  });

  it("designs nothing ahead when sharpening fails or is refused", async () => {
    vi.mocked(sharpenHunch).mockRejectedValue(new Error("bedrock down"));
    await POST(req({ rawText: "coffee wrecks sleep", answers: [] }));
    await POST(req({ rawText: "do I sleep better if I skip my antidepressant" }));

    expect(after).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Write the failing tests — redo route**

In `src/app/api/hunch/[id]/sharpen/route.test.ts`, add the same two `vi.mock` calls and the same two imports as Step 1. Then add inside the `describe` (the file's `gate` fixture and `sharpened` object are already defined):

```ts
  it("starts designing the re-sharpened hypothesis's plan", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(gate as never);
    vi.mocked(sharpenHunch).mockResolvedValue(sharpened as never);

    const res = await POST(req({ rawText: "coffee after 2pm", answers: [] }), params);

    expect(res.status).toBe(200);
    expect(after).toHaveBeenCalledTimes(1);
    // `after` also accepts a promise; the routes always pass a function.
    const scheduled = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
    await scheduled();
    expect(predesign).toHaveBeenCalledWith("h1");
  });

  it("designs nothing ahead when re-sharpening fails", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(gate as never);
    vi.mocked(sharpenHunch).mockRejectedValue(new Error("model down"));

    await POST(req({ rawText: "coffee after 2pm", answers: [] }), params);

    expect(after).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/app/api/hunch/route.test.ts "src/app/api/hunch/[id]/sharpen"`
Expected: FAIL — the two "starts designing…" tests (`after` called 0 times). The "designs nothing ahead…" tests pass already.

- [ ] **Step 4: Implement — create route**

In `src/app/api/hunch/route.ts`, change the `next/server` import and add two:

```ts
import { NextResponse, after } from "next/server";
import { untimed, withTiming } from "@/lib/timing";
import { predesign } from "@/lib/design-draft/predesign";
```

(replacing the existing `import { NextResponse } from "next/server";` and `import { withTiming } from "@/lib/timing";`)

Directly before `return NextResponse.json(` with status 201:

```ts
    // Design the plan while the user reads the confirm gate; confirm takes it
    // if nothing it depends on changed. A log never gets a designed plan.
    if (!parsed.data.observeOnly) after(() => untimed(() => predesign(hunch.id)));
```

- [ ] **Step 5: Implement — redo route**

In `src/app/api/hunch/[id]/sharpen/route.ts`, change the `next/server` import and add two:

```ts
import { NextResponse, after } from "next/server";
import { untimed } from "@/lib/timing";
import { predesign } from "@/lib/design-draft/predesign";
```

Directly before `return NextResponse.json(` with status 200:

```ts
    // The old draft was designed from the old hypothesis; this one replaces it.
    if (!parsed.data.observeOnly) after(() => untimed(() => predesign(updated.id)));
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/app/api/hunch/route.test.ts "src/app/api/hunch/[id]/sharpen"`
Expected: PASS, every test in both files.

- [ ] **Step 7: Gate and hand off**

Run: `npm test && npm run typecheck && npm run lint` — all green.
Report ready to commit: `perf(hunch): design the plan while the confirm gate is read`

---

### Task 7: Bench measures hits and waits

**Files:**
- Modify: `scripts/bench-hunch-flow.ts`

**Interfaces:**
- Consumes: the `draft` Server-Timing step from Task 5.

No unit test: the bench is a dev script with no test harness (as when it was added in `8402f45`). Its gate is typecheck, lint, and a dry parse run in Step 4.

- [ ] **Step 1: Add the pause argument**

After `const BASE = arg(...)`:

```ts
/** Seconds between W2 and W3, standing in for reading the confirm gate. */
const READ_PAUSE_MS = Math.max(0, Number(arg("read-pause", "8")) || 0) * 1000;
```

In the header comment's usage block, change the run line to:

```ts
 *   npx tsx scripts/bench-hunch-flow.ts [--runs 3] [--read-pause 8] [--base http://localhost:3000]
```

and add below it:

```ts
 * --read-pause is how long a user spends on the confirm gate before W3. With
 * a pause the background design has usually finished (W3 "hit"); with 0 the
 * confirm waits on it ("wait"). "miss" means W3 designed inline.
```

- [ ] **Step 2: Classify W3**

After the `baseName` helper:

```ts
/** What W3 got from the background design, read off its Server-Timing steps. */
function draftOutcome(steps: TimingEntry[]): "hit" | "wait" | "miss" | "-" {
  const draft = steps.find((e) => e.name === "draft");
  if (!draft) return "-";
  if (steps.some((e) => e.name === "designer" || e.name === "safety")) return "miss";
  return draft.dur > 250 ? "wait" : "hit";
}
```

- [ ] **Step 3: Pause before W3 and report the outcome**

In the W1–W3 chain, directly before the comment `// Confirm the gate with the Coach's own drafts unchanged`:

```ts
  if (READ_PAUSE_MS > 0) await new Promise((resolve) => setTimeout(resolve, READ_PAUSE_MS));
```

Replace the W3 `record(...)` call with:

```ts
  record(
    run, "W3", scenario, w3, null,
    w3.body.protocol
      ? `design=${w3.body.protocol.design?.shape} safety=${w3.body.protocol.safetyState} draft=${draftOutcome(w3.steps)}`
      : undefined,
  );
```

- [ ] **Step 4: Gate and hand off**

Run: `npm run typecheck && npm run lint && npx tsx scripts/bench-hunch-flow.ts --runs 1 --read-pause 0 --base http://localhost:1`
Expected: typecheck and lint clean. The script compiles and stops at its preflight with a fetch/connection error (`ECONNREFUSED` or "fetch failed") before any request — which proves it parses and that the new argument is accepted. It creates nothing: every write in the script happens after the preflight.
Report ready to commit: `perf(bench): pause on the confirm gate and report draft hits`

---

### Task 8: Measure it (needs OpenRouter credits)

**Files:** none changed. Results go to `scripts/.bench-results/` (gitignored).

- [ ] **Step 1: Start the stack**

```bash
npm run db:up
DEV_AUTH_BYPASS=1 HUNCH_TIMING=1 npx next dev -p 3100
```

- [ ] **Step 2: Hit path**

Run: `npx tsx scripts/bench-hunch-flow.ts --runs 3 --read-pause 8 --base http://localhost:3100`
Expected: W3 rows note `draft=hit` for phased scenarios; W3 median under ~300ms. Observational scenarios also `hit` when the Coach proposed a named exposure, otherwise `-`/inline.

- [ ] **Step 3: Wait path**

Run: `npx tsx scripts/bench-hunch-flow.ts --runs 3 --read-pause 0 --base http://localhost:3100`
Expected: W3 rows note `draft=wait`; W3 median no slower than the inline W3 of the most recent run without this feature.

- [ ] **Step 4: Check the server log**

Run: `grep "\[predesign\]" <dev server output>`
Expected: no lines. Any `[predesign] failed` means drafts are being lost — read the logged error before accepting the numbers.

- [ ] **Step 5: Report**

Report both summary tables and the raw result file names to the owner.
