# Issue #33 Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close issue #33 — an observational result is never presented as causal (memory, meter, export), stored trackers agree with what the UI logs, and the Coach stops padding.

**Architecture:** Six independent fixes on one branch. A `CausalEdge.kind` column carries "correlational" from `concludeTrial` through recall into the Coach and Clarifier prompts. A single `normalizeScale` guards every parameter write. The export, the meter heading and the retire route reuse helpers that already exist. The Coach padding fix is measured with a live eval before the prompt is touched.

**Tech Stack:** Next.js route handlers, Prisma (custom client output — after any schema change run `npx prisma generate` and clear `.next`), Vitest (`*.test.ts`, node env; `npm run test:eval` for live-model evals), Mastra agents.

**Spec:** `docs/superpowers/specs/2026-10-03-issue-33-follow-ups-design.md`

## Global Constraints

- Worktree `.claude/worktrees/issue-33`, branch `fix/issue-33-follow-ups`, off main `35ac4f3`.
- RULES §2: **the owner commits.** Each task ends "Ready to commit" with the message; do not run `git commit` unless the owner says so for this run.
- Never commit red: `npx tsc --noEmit`, `npm run lint`, `npx vitest run` all clean before a task is ready.
- `CausalEdge.kind` values are exactly `"causal"` | `"correlational"`, default `"causal"`.
- Scale rows are always `unit "1-5"`, `min 1`, `max 5` (`SCALE_MIN`/`SCALE_MAX` from `src/lib/schemas/parameter.ts`).
- Retire refusal message, verbatim: `This is how we know whether the change happened — it has to keep running.`
- Meter heading, verbatim: phased `Likelihood it's real`, observational `Likelihood they go together`.
- #4 (ObservationalPlan instructions) is closed with no code — see spec.

## Review Focus

1. A recalled prior from before this change (no `kind` on the object, e.g. echoed back by a client) must still parse — `priorSchema` defaults `kind` to `"causal"`. Test in Task 2.
2. An observational trial whose verdict is `inconclusive_insufficient` writes no edge at all (unchanged), not a correlational one. Test in Task 1.
3. A non-scale tracker that carries `min`/`max` (an `amount` with bounds) is untouched by `normalizeScale`. Test in Task 3.
4. An export of an observational trial with no verdict yet, and of a phased trial with no exposure, must not print exposure lines or throw. Tests in Task 4.
5. Un-retiring the exposure stays allowed on every shape (only `retired: true` is refused). Test in Task 6.

---

### Task 1: Observational verdicts write correlational edges

**Files:**
- Modify: `prisma/schema.prisma` (model `CausalEdge`)
- Create: `prisma/migrations/20261003120000_causal_edge_kind/migration.sql`
- Modify: `src/lib/memory/causal-graph.ts`
- Modify: `src/lib/conclude-trial.ts:97-106`
- Test: `src/lib/memory/causal-graph.test.ts`

**Interfaces:**
- Produces: `type EdgeKind = "causal" | "correlational"` exported from `src/lib/memory/causal-graph.ts`; `CausalEdgeInput.kind: EdgeKind`; `writeEdgeData({ ..., shape: ProtocolShape })` (required); Prisma `CausalEdge.kind: string`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/memory/causal-graph.test.ts`, add `shape: "phased" as const` to `base`, add `kind: "causal"` to the `toEqual` in the first test, and append:

```ts
describe("writeEdgeData and the trial's shape", () => {
  it("marks an observational trial's finding correlational", () => {
    const edge = writeEdgeData({ ...base, shape: "observational", category: "helped" });
    expect(edge?.kind).toBe("correlational");
  });

  it("marks a phased trial's finding causal", () => {
    expect(writeEdgeData({ ...base, category: "hurt" })?.kind).toBe("causal");
  });

  it("still writes nothing for an observational trial with too few days", () => {
    expect(
      writeEdgeData({ ...base, shape: "observational", category: "inconclusive_insufficient" }),
    ).toBe(null);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/memory/causal-graph.test.ts`
Expected: FAIL — `kind` is undefined.

- [ ] **Step 3: Schema and migration**

`prisma/schema.prisma`, in `model CausalEdge` after `confidence`:

```prisma
  /// "causal" when a scheduled trial assigned the days; "correlational" when
  /// the user's own yes/no did (an observational trial) — what went together,
  /// not what caused what.
  kind          String   @default("causal")
```

`prisma/migrations/20261003120000_causal_edge_kind/migration.sql`:

```sql
-- An observational trial compares the days the user chose to do something
-- with the days they didn't. Its result is a correlation, and the Coach must
-- not treat it as a tested finding. Existing rows keep "causal": no deployment
-- holds observational edges worth back-filling.
ALTER TABLE "CausalEdge" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'causal';
```

Run: `npx prisma migrate deploy && npx prisma generate && rm -rf .next`

- [ ] **Step 4: Implement**

`src/lib/memory/causal-graph.ts`: import `import type { ProtocolShape } from "@/lib/schemas/protocol";`, then

```ts
/** How far a stored finding can be trusted: tested, or only seen together. */
export type EdgeKind = "causal" | "correlational";
```

Add `kind: EdgeKind;` to `CausalEdgeInput` (after `confidence`). In `writeEdgeData`'s input type add:

```ts
  /** The trial's design. An observational one only shows what went together. */
  shape: ProtocolShape;
```

and in the returned object add `kind: input.shape === "observational" ? "correlational" : "causal",`.

`src/lib/conclude-trial.ts`, in the `writeEdgeData({ ... })` call add `shape: design.shape,` (the `design` already parsed at line ~52).

- [ ] **Step 5: Verify**

Run: `npx vitest run src/lib/memory/causal-graph.test.ts` → PASS. Then `npx tsc --noEmit && npm run lint && npx vitest run` → all green (tsc proves no other `writeEdgeData` caller was missed).

- [ ] **Step 6: Ready to commit**

`feat(memory): store an observational verdict as a correlation`

---

### Task 2: Recall carries the kind; Coach and Clarifier read it

**Files:**
- Modify: `src/lib/schemas/prior.ts`
- Modify: `src/lib/memory/priors.ts` (`toPriors`, new `priorsBlock`)
- Modify: `src/mastra/agents/hypothesis-coach.ts:141-146`
- Modify: `src/mastra/agents/clarifier.ts:60-65`
- Test: `src/lib/memory/priors.test.ts`, `src/mastra/agents/hypothesis-coach.test.ts`

**Interfaces:**
- Consumes: Prisma `CausalEdge.kind` (Task 1).
- Produces: `Prior.kind: "causal" | "correlational"`; `priorsBlock(priors: Prior[], lead: { tested: string; untested: string }): string` from `src/lib/memory/priors.ts` — returns `""` for no priors, otherwise `"\n\n" + section(s)`, each section omitted when empty.

- [ ] **Step 1: Write the failing tests**

`src/lib/memory/priors.test.ts` — add `kind: "causal"` to the `edge()` fixture defaults (line ~6), add `kind: "causal"` to the expected object in the existing `toPriors` test, then append:

```ts
import { priorSchema } from "@/lib/schemas/prior";
import { priorsBlock } from "@/lib/memory/priors";

describe("toPriors and the edge's kind", () => {
  it("carries a correlational edge's kind through", () => {
    const corr = { ...caffeine, kind: "correlational" };
    expect(toPriors([corr], ["h_caf"])[0].kind).toBe("correlational");
  });
});

describe("priorSchema", () => {
  it("reads a prior written before kind existed as causal", () => {
    const old = {
      cause: "c", effect: "e", direction: "increases",
      effectSize: 1, confidence: 0.9, sourceHunchId: "h",
    };
    expect(priorSchema.parse(old).kind).toBe("causal");
  });
});

describe("priorsBlock", () => {
  const lead = { tested: "TESTED:", untested: "UNTESTED:" };
  const tested = {
    cause: "Coffee after 2pm hurts sleep", effect: "sleep", direction: "decreases" as const,
    effectSize: -1, confidence: 0.82, sourceHunchId: "h1", kind: "causal" as const,
  };
  const seen = { ...tested, cause: "Late screens hurt sleep", confidence: 0.71, sourceHunchId: "h2", kind: "correlational" as const };

  it("is empty with no priors", () => {
    expect(priorsBlock([], lead)).toBe("");
  });

  it("lists each kind under its own lead", () => {
    const block = priorsBlock([tested, seen], lead);
    expect(block).toBe(
      "\n\nTESTED:\n- Coffee after 2pm hurts sleep (decreases, 82% confident)" +
        "\n\nUNTESTED:\n- Late screens hurt sleep (decreases, 71% confident)",
    );
  });

  it("omits a lead with nothing under it", () => {
    expect(priorsBlock([seen], lead).startsWith("\n\nUNTESTED:")).toBe(true);
    expect(priorsBlock([tested], lead)).not.toContain("UNTESTED");
  });
});
```

`src/mastra/agents/hypothesis-coach.test.ts`, inside `describe("buildSharpenPrompt", …)`:

```ts
  it("tells a tested finding from one that only went together", () => {
    const base = { effect: "sleep", direction: "decreases" as const, effectSize: -1, confidence: 0.8 };
    const p = buildSharpenPrompt("coffee wrecks sleep", [
      { ...base, cause: "Coffee after 2pm hurts sleep", sourceHunchId: "h1", kind: "causal" },
      { ...base, cause: "Late screens hurt sleep", sourceHunchId: "h2", kind: "correlational" },
    ], []);
    const tested = p.indexOf("do not contradict them");
    const leads = p.indexOf("treat them as leads, not facts");
    expect(tested).toBeGreaterThan(-1);
    expect(leads).toBeGreaterThan(tested);
    expect(p.slice(tested, leads)).toContain("Coffee after 2pm");
    expect(p.slice(leads)).toContain("Late screens");
    expect(p.slice(tested, leads)).not.toContain("Late screens");
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/memory/priors.test.ts src/mastra/agents/hypothesis-coach.test.ts`
Expected: FAIL — `priorsBlock` not exported; `kind` missing.

- [ ] **Step 3: Implement**

`src/lib/schemas/prior.ts`, add to `priorSchema`:

```ts
  /** "correlational" when it came from an observational trial — seen together, never tested. */
  kind: z.enum(["causal", "correlational"]).default("causal"),
```

`src/lib/memory/priors.ts`, in `toPriors`' first `.map` add `kind: e.kind,`. Append:

```ts
/**
 * The priors as prompt text, tested findings and things that only went
 * together under separate leads — an observational result must never reach a
 * model as something it may not contradict. Empty string when there are none.
 */
export function priorsBlock(
  priors: Prior[],
  lead: { tested: string; untested: string },
): string {
  const line = (p: Prior) =>
    `- ${p.cause} (${p.direction}, ${Math.round(p.confidence * 100)}% confident)`;
  const tested = priors.filter((p) => p.kind === "causal");
  const untested = priors.filter((p) => p.kind === "correlational");
  return [
    tested.length > 0 ? `\n\n${lead.tested}\n${tested.map(line).join("\n")}` : "",
    untested.length > 0 ? `\n\n${lead.untested}\n${untested.map(line).join("\n")}` : "",
  ].join("");
}
```

`src/mastra/agents/hypothesis-coach.ts`, replace the `priorsBlock` const with:

```ts
  const priorsText = priorsBlock(priors, {
    tested:
      "The user has already learned these related findings; take them into account, do not contradict them:",
    untested:
      "These went together in the user's own logs, but were never tested — treat them as leads, not facts:",
  });
```

and use `${priorsText}` where `${priorsBlock}` was in the returned string; import `priorsBlock` from `@/lib/memory/priors`.

`src/mastra/agents/clarifier.ts`, same replacement:

```ts
  const priorsText = priorsBlock(priors, {
    tested: "The user already learned these related findings; don't ask about them again:",
    untested:
      "These went together in the user's own logs but were never tested — fine to ask about:",
  });
```

and `${priorsText}` in the prompt string.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/lib/memory src/mastra/agents/hypothesis-coach.test.ts` → PASS; then `npx tsc --noEmit && npm run lint && npx vitest run` → green.

- [ ] **Step 5: Ready to commit**

`feat(coach): read an untested finding as a lead, not a fact`

---

### Task 3: Scale ranges are always 1–5 when stored

**Files:**
- Modify: `src/lib/parameters.ts` (new `normalizeScale`; `draftsFromSharpened`)
- Modify: `src/app/api/hunch/[id]/protocol/route.ts:142-154`
- Modify: `src/app/api/hunch/[id]/parameters/route.ts:58-75`
- Create: `prisma/migrations/20261003120100_scale_units_again/migration.sql`
- Test: `src/lib/parameters.test.ts`, `src/app/api/hunch/[id]/protocol/route.test.ts`, `src/app/api/hunch/[id]/parameters/route.test.ts`

**Interfaces:**
- Produces: `normalizeScale<T extends { type: string; unit?: string | null; min?: number | null; max?: number | null }>(p: T): T` from `src/lib/parameters.ts`.

- [ ] **Step 1: Write the failing tests**

`src/lib/parameters.test.ts`:

```ts
import { normalizeScale } from "@/lib/parameters";

describe("normalizeScale", () => {
  it("pins a 1-10 scale to 1-5", () => {
    expect(normalizeScale({ label: "Energy", type: "scale", unit: "1-10", min: 1, max: 10 }))
      .toEqual({ label: "Energy", type: "scale", unit: "1-5", min: 1, max: 5 });
  });

  it("fills a scale with no range", () => {
    expect(normalizeScale({ label: "Mood", type: "scale" }))
      .toMatchObject({ unit: "1-5", min: 1, max: 5 });
  });

  it("leaves an amount's own bounds alone", () => {
    const amount = { label: "Sleep", type: "amount", unit: "hrs", min: 0, max: 14 };
    expect(normalizeScale(amount)).toEqual(amount);
  });
});
```

and inside `describe("draftsFromSharpened", …)`:

```ts
  it("stores a Coach's 1-10 scale as 1-5", () => {
    const drafts = draftsFromSharpened({
      outcomeMetric: "sleep",
      outcomeType: "continuous",
      trackers: [{ label: "Stress", type: "scale", unit: "1-10", min: 1, max: 10 }],
    });
    expect(drafts[1]).toMatchObject({ label: "Stress", unit: "1-5", min: 1, max: 5 });
  });
```

`src/app/api/hunch/[id]/protocol/route.test.ts`:

```ts
  it("stores a confirmed scale as 1-5 whatever range it arrived with", async () => {
    const res = await POST(
      req({
        parameters: [
          primary,
          { label: "stress", type: "scale", unit: "1-10", min: 1, max: 10, isPrimary: false },
        ],
      }),
      params,
    );
    expect(res.status).toBe(201);
    expect(createdRows()[1]).toMatchObject({ label: "stress", unit: "1-5", min: 1, max: 5 });
  });
```

`src/app/api/hunch/[id]/parameters/route.test.ts`:

```ts
  it("stores an added scale as 1-5 whatever range it arrived with", async () => {
    const res = await POST(
      req({ label: "Stress", type: "scale", unit: "1-10", min: 1, max: 10 }),
      params,
    );
    expect(res.status).toBe(201);
    const arg = vi.mocked(db.parameter.create).mock.calls[0][0] as unknown as {
      data: { unit: string; min: number; max: number };
    };
    expect(arg.data).toMatchObject({ unit: "1-5", min: 1, max: 5 });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/parameters.test.ts "src/app/api/hunch/[id]/protocol" "src/app/api/hunch/[id]/parameters/route.test.ts"`
Expected: FAIL — `normalizeScale` not exported; stored 1-10.

- [ ] **Step 3: Implement**

`src/lib/parameters.ts` (import `SCALE_MIN, SCALE_MAX` from `@/lib/schemas/parameter`):

```ts
/**
 * A scale is 1-5 by kind, not by row: the check-in renders five taps and
 * `validateParameterValue` refuses anything else. Pin every stored scale to
 * that, so a Coach or Designer that wrote "1-10" can't leave a label
 * advertising a range the control doesn't offer. Other kinds keep their own.
 */
export function normalizeScale<
  T extends { type: string; unit?: string | null; min?: number | null; max?: number | null },
>(p: T): T {
  if (p.type !== "scale") return p;
  // The cast: TS can't prove a spread with overridden keys is still `T`.
  return { ...p, unit: `${SCALE_MIN}-${SCALE_MAX}`, min: SCALE_MIN, max: SCALE_MAX } as T;
}
```

In `draftsFromSharpened`, the trackers `.map` becomes
`.map((t) => normalizeScale({ ...t, isPrimary: false, isExposure: false }));`

Protocol route: `data: confirmedRows.map(normalizeScale).map((p, i) => ({ ...unchanged }))`, importing `normalizeScale` from `@/lib/parameters`.

Parameters route: before `db.parameter.create`, `const t = normalizeScale(parsed.data);` and use `t.unit ?? null`, `t.min ?? null`, `t.max ?? null`, `t.label`, `t.type`.

`prisma/migrations/20261003120100_scale_units_again/migration.sql`:

```sql
-- 20260903010000 pinned every scale to 1-5, but nothing stopped a new row
-- arriving as 1-10 afterwards. Writes are normalised now; this catches the
-- rows written in between.
UPDATE "Parameter"
SET "unit" = '1-5', "min" = 1, "max" = 5
WHERE "type" = 'scale' AND ("unit" IS DISTINCT FROM '1-5' OR "min" IS DISTINCT FROM 1 OR "max" IS DISTINCT FROM 5);
```

Run: `npx prisma migrate deploy`

- [ ] **Step 4: Verify**

Run the Step 2 command → PASS; then `npx tsc --noEmit && npm run lint && npx vitest run` → green.

- [ ] **Step 5: Ready to commit**

`fix(parameters): store every scale as 1-5`

---

### Task 4: The export speaks the observational trial's own terms

**Files:**
- Modify: `src/lib/export.ts` (`ExportHunch`, `toText`)
- Modify: `src/app/api/hunch/[id]/export/route.ts:44-58`
- Test: `src/lib/export.test.ts`

**Interfaces:**
- Consumes: `exposureReport(checkIns, exposure, shape)` and `pickExposure` (`src/lib/parameters.ts`); `verdictHeadline(category, outcome, exposure)`, `exposureSummary`, `exposureDropped`, `observationalCaveat` (`src/lib/verdict.ts`); `ExposureReport` (`src/lib/schemas/verdict.ts`).
- Produces: `ExportHunch.exposure: ExposureReport | null`.

- [ ] **Step 1: Write the failing tests**

`src/lib/export.test.ts`: add `exposure: null,` to the `hunch` fixture. On `observationalHunch` add

```ts
  exposure: { label: "Played basketball", exposed: 9, unexposed: 11, unknown: 1, observational: true },
  verdict: { ...hunch.verdict!, category: "hurt", nA: 11, nB: 9 },
```

Append:

```ts
describe("toText — observational verdict", () => {
  const text = toText(observationalHunch);

  it("counts yes-days and no-days, never baseline and intervention", () => {
    expect(text).toContain("9 yes-days, 11 no-days");
    expect(text).not.toMatch(/baseline days|intervention days/);
  });

  it("says what went together, as the verdict card does", () => {
    expect(text).toContain("shows what went together, not what caused what");
  });

  it("carries the card's day count and dropped-day lines", () => {
    expect(text).toContain("Played basketball on 9 of 21 logged days.");
    expect(text).toContain("1 day had no answer either way");
  });

  it("uses the card's headline for a thin trial", () => {
    const thin = toText({
      ...observationalHunch,
      verdict: { ...observationalHunch.verdict!, category: "inconclusive_insufficient" },
    });
    expect(thin).toContain('Too few days either side of "Played basketball"');
  });

  it("writes no exposure lines before there is a verdict", () => {
    const running = toText({ ...observationalHunch, verdict: null });
    expect(running).not.toContain("what went together");
  });
});

describe("toText — phased verdict", () => {
  it("keeps baseline and intervention days and no caveat", () => {
    const text = toText(hunch);
    expect(text).toContain("7 baseline days, 7 intervention days");
    expect(text).not.toContain("what went together");
  });

  it("adds the adherence line when the trial carries a yes/no", () => {
    const text = toText({
      ...hunch,
      exposure: { label: "Skipped coffee", exposed: 5, unexposed: 2, unknown: 0, observational: false },
    });
    expect(text).toContain("Skipped coffee on 5 of 7 intervention days.");
  });
});
```

(If `observationalHunch`'s existing fixture defines `verdict` differently, keep its other fields and override only `category`, `nA`, `nB` as above.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/export.test.ts`
Expected: FAIL — `exposure` not on `ExportHunch`; phased wording printed.

- [ ] **Step 3: Implement**

`src/lib/export.ts`: import `exposureDropped, exposureSummary, observationalCaveat` alongside `verdictHeadline`, and `type ExposureReport` from `@/lib/schemas/verdict`. Add to `ExportHunch`:

```ts
  /** The yes/no's day counts, built the way the verdict card builds them; null without one. */
  exposure: ExposureReport | null;
```

In `toText`'s verdict branch replace from `const headline = …` through the `Effect:` push with:

```ts
    const e = h.exposure;
    const observational = e?.observational === true;
    const headline = verdictHeadline(
      v.category as VerdictCategory,
      primary ? { label: primary.label, unit: primary.unit ?? undefined } : null,
      e,
    );
    lines.push(`${headline} — ${Math.round(v.pEffect * 100)}% sure`);
    // Every sentence below is the verdict card's own, from the same helpers —
    // the file outlives the app and must not tell a different story.
    const summary = e ? exposureSummary(e) : null;
    if (summary) lines.push(summary);
    const dropped = observational && e ? exposureDropped(e) : null;
    if (dropped) lines.push(dropped);
    lines.push(v.narrative);
    const days = observational
      ? `${v.nB} yes-days, ${v.nA} no-days`
      : `${v.nA} baseline days, ${v.nB} intervention days`;
    lines.push(
      `Effect: ${v.effect.toFixed(2)} (95% credible interval ${v.ci[0].toFixed(2)} to ` +
        `${v.ci[1].toFixed(2)}); ${days}.`,
    );
    if (observational && e) lines.push(observationalCaveat(e));
```

`src/app/api/hunch/[id]/export/route.ts`: import `exposureReport` with `pickExposure`; replace the `exposureId` line with

```ts
  const exposureParam = pickExposure(hunch.parameters);
  const exposureId = exposureParam?.id ?? null;
  const exposure = exposureReport(hunch.checkIns, exposureParam, shape);
```

and add `exposure,` to `data`.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/lib/export.test.ts` → PASS; then `npx tsc --noEmit && npm run lint && npx vitest run` → green.

- [ ] **Step 5: Ready to commit**

`fix(export): describe an observational verdict as the card does`

---

### Task 5: The meter doesn't read as causal on an observational trial

**Files:**
- Modify: `src/lib/verdict.ts` (new `beliefHeading`)
- Modify: `src/components/belief-meter.tsx`
- Modify: `src/components/hunch/hunch-dashboard.tsx:~85-93`
- Modify: `src/components/verdict.tsx:~97`
- Test: `src/lib/verdict.test.ts`

**Interfaces:**
- Produces: `beliefHeading(observational: boolean): string`; `BeliefMeter` prop `observational?: boolean`.

- [ ] **Step 1: Write the failing test**

`src/lib/verdict.test.ts`:

```ts
import { beliefHeading } from "@/lib/verdict";

describe("beliefHeading", () => {
  it("asks whether it's real on a scheduled trial", () => {
    expect(beliefHeading(false)).toBe("Likelihood it's real");
  });
  it("asks only whether they go together on an observational one", () => {
    expect(beliefHeading(true)).toBe("Likelihood they go together");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/verdict.test.ts` → FAIL, not exported.

- [ ] **Step 3: Implement**

`src/lib/verdict.ts`:

```ts
/**
 * The meter's heading. An observational trial can't say a change is "real" —
 * the user chose their days — only how likely the two went together.
 */
export function beliefHeading(observational: boolean): string {
  return observational ? "Likelihood they go together" : "Likelihood it's real";
}
```

`src/components/belief-meter.tsx`: signature
`export function BeliefMeter({ belief, observational = false }: { belief: Belief; observational?: boolean })`,
import `beliefHeading` from `@/lib/verdict`, and the `<h2>` body becomes `{beliefHeading(observational)}`.

`src/components/hunch/hunch-dashboard.tsx`: import `observationalCaveat` with `exposureSummary`. Before the return add
`const exposure = query.data.exposure ?? null;`. Replace `<BeliefMeter belief={belief} />` with
`<BeliefMeter belief={belief} observational={exposure?.observational === true} />`, and after the `exposureLine` paragraph add:

```tsx
            {/* Same caveat the verdict card carries — the running meter must
                not read as cause and effect for days the user chose. */}
            {exposure?.observational && (
              <p className="m-0 text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                {observationalCaveat(exposure)}
              </p>
            )}
```

`src/components/verdict.tsx`: `<BeliefMeter belief={beliefFrom(v)} observational={v.exposure?.observational === true} />`.

- [ ] **Step 4: Verify**

`npx vitest run src/lib/verdict.test.ts` → PASS; then `npx tsc --noEmit && npm run lint && npx vitest run` → green.

- [ ] **Step 5: Live check**

On the dev server, open a running observational trial's dashboard: heading reads "Likelihood they go together" and the caveat sits under the meter. Open a running phased trial: "Likelihood it's real", no caveat.

- [ ] **Step 6: Ready to commit**

`fix(dashboard): don't read an observational meter as cause and effect`

---

### Task 6: The daily yes/no can't be retired on any trial

**Files:**
- Modify: `src/app/api/hunch/[id]/parameters/[parameterId]/route.ts`
- Modify: `src/components/hunch/tracker-editor.tsx:33-60`
- Test: `src/app/api/hunch/[id]/parameters/[parameterId]/route.test.ts`

- [ ] **Step 1: Rewrite the tests**

Replace the two exposure-refusal tests (observational refusal at ~111 and "retires the exposure on a phased trial" at ~125) with:

```ts
  it.each([
    ["observational", observationalProtocol],
    ["phased", phasedProtocol],
    ["not yet designed", null],
  ])("refuses to retire the yes/no on a %s trial", async (_, protocol) => {
    vi.mocked(db.parameter.findFirst).mockResolvedValue({
      ...tracker,
      isExposure: true,
      hunch: { protocol },
    } as never);
    const res = await PATCH(req({ retired: true }), params);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({
      error: "This is how we know whether the change happened — it has to keep running.",
    });
    expect(db.parameter.update).not.toHaveBeenCalled();
  });
```

Keep "un-retires the exposure even on an observational trial" as is, and add the phased twin:

```ts
  it("un-retires the exposure on a phased trial too", async () => {
    vi.mocked(db.parameter.findFirst).mockResolvedValue({
      ...tracker,
      isExposure: true,
      retiredAt: new Date("2026-09-01T00:00:00.000Z"),
      hunch: { protocol: phasedProtocol },
    } as never);
    const res = await PATCH(req({ retired: false }), params);
    expect(res.status).toBe(200);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run "src/app/api/hunch/[id]/parameters/[parameterId]"` → the phased and not-yet-designed cases FAIL (200).

- [ ] **Step 3: Implement**

Route: replace the whole `if (parameter.isExposure && parsed.data.retired) { … }` block with

```ts
  // The yes/no is how the trial knows whether the change happened: on an
  // observational trial it assigns the arms, on a phased one it is the
  // adherence count. Stop it mid-trial and the strip and the count line
  // disagree about every day after.
  if (parameter.isExposure && parsed.data.retired) {
    return NextResponse.json(
      { error: "This is how we know whether the change happened — it has to keep running." },
      { status: 409 },
    );
  }
```

Remove the now-unused `parseStoredDesign` import and the `include: { hunch: { include: { protocol: true } } }` on the `findFirst` (keep the ownership `where`). Rewrite the doc paragraph that begins "The exposure is refused the same way, but only on an observational trial" to: "The exposure is refused the same way on every trial — it is how the trial knows whether the change happened that day."

`tracker-editor.tsx`: the guard becomes `if (p.isPrimary || p.isExposure)`; the label becomes
`{p.isPrimary ? "main measure" : observational ? "days we compare" : "did the change happen"} · runs the whole trial`.
Update the `TrackerRow` doc comment: "The primary gets no door, and neither does the daily yes/no — the route refuses to retire it on any trial."

- [ ] **Step 4: Verify**

Step 2 command → PASS; `npx tsc --noEmit && npm run lint && npx vitest run` → green. (The tests' mock objects still carry `hunch.protocol`; harmless.)

- [ ] **Step 5: Live check**

Open a running phased trial carrying a yes/no, open its tracker editor: the yes/no row shows "did the change happen · runs the whole trial" with no "Stop tracking".

- [ ] **Step 6: Ready to commit**

`fix(trackers): keep the daily yes/no running on every trial`

---

### Task 7: Coach tracker padding — measure, then guard

**Files:**
- Modify: `src/mastra/agents/hypothesis-coach.eval.test.ts`
- Modify (only if Step 2 shows flat 4s): `src/mastra/agents/hypothesis-coach.ts:117-119`
- Modify: this plan (record counts under "Results")

Needs `OPENROUTER_API_KEY` (the eval self-skips without it).

- [ ] **Step 1: Add the eval**

Inside the `describe.skipIf(!hasKey)` block:

```ts
  // Padding regressed once already: every hunch came back with exactly four
  // trackers, filler like "time spent shopping" among them.
  test("doesn't pad every hunch to four trackers", async () => {
    const raws = [
      "i think coffee in the afternoon wrecks my sleep",
      "standing desk seems to help me focus",
      "magnesium before bed settles me down",
      "my knee hurts after playing basketball",
      "I spend more money when I shop hungry",
      "cold showers make me less anxious",
    ];
    const counts = await Promise.all(
      raws.map(async (r) => (await sharpenHunch(r)).trackers?.length ?? 0),
    );
    console.log("tracker counts", counts);
    expect(counts.some((c) => c < 4)).toBe(true);
  }, 240_000);
```

- [ ] **Step 2: Measure**

Run: `npm run test:eval -- src/mastra/agents/hypothesis-coach.eval.test.ts -t "pad"`. Record the printed counts under Results. If it passes, skip Step 3.

- [ ] **Step 3: Tighten the prompt (only if all six were 4)**

Replace the "Propose FEWER than four…" paragraph with:

```
  Every tracker must earn its place: before adding one, name to yourself what
  it would explain if the outcome moved. If you can't, leave it out. Zero, one
  or two trackers is the normal answer; four is rare. "Time spent doing the
  thing" is padding, and so is anything the person wouldn't think to mention.
```

Re-run Step 2; record the new counts. If still flat 4 after this one change, stop and report to the owner rather than iterating further.

- [ ] **Step 4: Verify**

`npx tsc --noEmit && npm run lint && npx vitest run` → green (the eval is excluded from the default run).

- [ ] **Step 5: Ready to commit**

`test(coach): fail when every hunch is padded to four trackers` (plus `fix(coach): …` if Step 3 ran).

---

## Finish

- Live: download an observational trial's `.txt` export and check it against its verdict card, line by line.
- Comment on #33 closing #4 with the spec's explanation; tick the six fixed boxes in the PR description.

## Results

_(filled during execution)_
