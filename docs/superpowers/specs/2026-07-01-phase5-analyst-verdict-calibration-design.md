# Phase 5 — Analyst verdict + Calibration eval (Design Spec)

> Status: draft 2026-07-01. Expands the Phase 5 milestone in `PLAN.md`.
> Binding constraints: `RULES.md` (esp. §3 TDD / no LLM arithmetic, §7 scope).
> Product source of truth: `RESEARCH.md` (§5 calibration, §10 open questions).
> Builds directly on Phase 4 (`docs/superpowers/specs/2026-06-30-phase4-checkins-bayesian-belief-design.md`).

## Goal

When an experiment's ABA schedule ends, the hunch **concludes** and gets a
**frozen, plain-English verdict** with a calibrated confidence and effect size:
"it helped," "it hurt," or — just as legitimately — "no detectable effect" or
"not enough data." The confidence number is the Phase 4 Bayesian engine's own
`pEffect`; an LLM **Analyst** only translates that number and category into prose.
Calibration of the number is **eval-gated** by a deterministic Brier-score test.

## Resolved decisions

1. **Engine owns the number, the LLM narrates.** The Analyst receives the
   deterministic belief (`pEffect`, `effect`, `ci`, `nA`, `nB`, `model`) plus the
   classified category and writes prose only. It never produces or alters a
   probability (RULES §3 — no LLM arithmetic). This keeps the verdict consistent
   with the Phase 4 belief meter (same number everywhere) and makes calibration
   testable against a stable, deterministic predictor.

2. **Conclusion is automatic on schedule end, with a minimum-data floor.** A trial
   concludes when `currentPhase(...).done` is true. If either arm has fewer than 3
   check-ins (the same "warming-up" floor as Phase 4), the verdict is
   `inconclusive_insufficient`. No manual "end early" action (avoids premature
   ending / cherry-picking).

3. **A "clear" verdict is defined by the credible interval crossing zero** — the
   exact rule the belief meter already draws. CI excludes 0 → clear (`helped` if
   `effect > 0`, `hurt` if `effect < 0`). CI straddles 0 → `inconclusive_no_effect`.
   No arbitrary `pEffect` band edges; no per-metric practical-significance
   threshold (deferred to Phase 6).

4. **The verdict is generated once and stored** (not recomputed on read like the
   Phase 4 posterior). The narrative is an LLM call — costly and non-deterministic
   to regenerate per page load — and a concluded trial gains no new data, so a
   frozen verdict is the correct model. A `Verdict` snapshot row is persisted the
   first time the trial is read after the schedule ends.

5. **Classification is a pure TS function, not the LLM.** `classifyVerdict` maps a
   belief + schedule to a category deterministically; the LLM is handed the
   already-decided category. This keeps the decision logic unit-testable and the
   LLM's role purely linguistic.

## Verdict categories

`classifyVerdict(belief, schedule)` returns one of, in priority order:

| Category | Condition | Meaning |
|---|---|---|
| `null` | `!schedule.done` | Trial still running — no verdict yet. |
| `inconclusive_insufficient` | `nA < 3 \|\| nB < 3` | Not enough logged days to judge. |
| `helped` | CI excludes 0 and `effect > 0` | Intervention improved the outcome. |
| `hurt` | CI excludes 0 and `effect < 0` | Intervention worsened the outcome. |
| `inconclusive_no_effect` | CI straddles 0 | Data sufficient; no detectable effect either way. |

`CI excludes 0` ≡ `ci[0] > 0 || ci[1] < 0`. Both `inconclusive_*` categories are
presented as legitimate findings (RESEARCH §10), never as errors or failures.

## Architecture / data flow

```
GET /api/hunch/[id]/verdict
  → auth + ownership (same guard as belief/checkin routes)
  → load hunch + hypothesis + protocol + checkIns
  → if Verdict row exists: return it (stable, free)
  → else:
       belief   = computeBelief(checkIns, outcomeType)        // Phase 4, pure
       schedule = currentPhase(protocol.startedAt, design, now) // Phase 4, pure
       if !schedule.done → 409 "trial still running"           // no verdict yet
       category = classifyVerdict(belief, schedule)            // pure TS
       narrative = analyst.generate(category + belief snapshot) // LLM, prose only
       persist Verdict + flip Hunch.status="concluded"          // one transaction
       return Verdict
```

The Analyst is a Mastra agent; the orchestration lives in a workflow mirroring
`design.ts`. The number path (engine → classify) is entirely deterministic and
tested; the LLM sits at the leaf and touches only language.

## Components (units, each independently testable)

- **`src/lib/verdict.ts`** — `type VerdictCategory`, pure `classifyVerdict(belief,
  schedule): VerdictCategory | null`. Unit-tested against the table above,
  including boundary CIs (touches 0, one bound exactly 0).
- **`src/lib/schemas/verdict.ts`** — zod `verdictSchema` (the persisted/returned
  shape: category, narrative, pEffect, effect, ci tuple, nA, nB, model) + type.
- **`src/mastra/agents/analyst.ts`** — Analyst agent. System prompt: translate a
  given category + numbers into a short, honest verdict; state the direction and
  effect size; frame inconclusive as a real result; never invent or contradict the
  number. Output constrained to a narrative string.
- **`src/mastra/workflows/analysis.ts`** — `runAnalysis(hunch context)`:
  belief → classify → Analyst narrate → return `{category, narrative, snapshot}`.
- **`prisma/schema.prisma`** — new `Verdict` model (1:1 with Hunch, cascade
  delete); `Hunch.status` gains the `concluded` state on verdict creation. Migration
  hand-authored + `prisma generate` (Phase 4 convention).
- **`src/app/api/hunch/[id]/verdict/route.ts`** — `GET` per the flow above.
  Thin, verified live (no route unit tests, per codebase convention).
- **`src/hooks/use-verdict.ts`** — `useVerdict(hunchId)` TanStack query,
  parallel to `useBelief`.
- **`src/components/verdict.tsx`** — renders the frozen verdict: category headline,
  the credible-interval bar (reuse the Phase 4 SVG treatment), effect size, and the
  Analyst narrative. Inconclusive states get affirmative framing.
- **`src/app/hunch/[id]/page.tsx`** — when the hunch is `concluded` (verdict
  exists), render `<Verdict>` in place of `<CheckInTap>`; running trials unchanged.

## Evals

- **`src/mastra/evals/calibration.eval.ts` — deterministic, no LLM, THE GATE.**
  Generate N synthetic n-of-1 trials with a *known* ground-truth effect (a mix of
  real-effect and null trials, both outcome types), simulate check-ins, run
  `computeBelief`, take `pEffect` as the forecast and `(true effect > 0)` as the
  outcome. Assert the **Brier score** `mean((pEffect − outcome)²)` is below a
  threshold and reliability across probability bins is reasonable. Runs in the
  normal `vitest` suite — cheap, reproducible, gates every build (RESEARCH §5).
  Uses a **seeded deterministic PRNG local to the eval** (the production engine
  stays RNG-free; the seed lives only in test data generation).
- **`src/mastra/agents/analyst.eval.test.ts` — LLM, key-gated (Phase 3 style).**
  Feed fixed belief snapshots for each category; assert the narrative (a) states
  the category faithfully, (b) never contradicts the sign or magnitude, (c) frames
  inconclusive as a legitimate result. Runs under `test:eval` with
  `OPENROUTER_API_KEY`, like the existing agent evals.

The split mirrors the labor decision: the **number** is gated by the deterministic
calibration eval; the **prose** by the faithfulness eval.

## Known simplifications (v1)

- **No practical-significance floor.** A statistically-clear but tiny effect still
  reads as `helped`/`hurt`. Effect-size thresholds are Phase 6.
- **Lazy conclusion.** Status flips to `concluded` on the first verdict read after
  the schedule ends, not by a background job (the app has none). A trial whose
  schedule has ended but that is never opened stays `running` until viewed —
  acceptable, since the verdict is a read-time artifact anyway.
- **Verdict is frozen.** Late check-ins after conclusion do not regenerate it (a
  concluded trial has no open logging day). Regenerate-on-late-data is out of scope.
- **Pooled baselines / direction-agnostic engine** inherited from Phase 4 unchanged.

## Out of scope (Phase 6+)

- Practical-significance effect-size floor; regenerate-verdict action.
- Causal-graph memory / `CausalEdge` writes (Phase 6).
- Multi-hypothesis or cross-experiment synthesis.
- No new npm dependencies.

## Exit criteria

- Concluded experiments show a calibrated verdict + effect size.
- "Inconclusive" reads as a legitimate outcome, not a failure.
- Deterministic calibration eval passes (Brier below threshold) in the normal suite.
- Analyst faithfulness eval passes under `test:eval`.
- All standard gates green (typecheck, lint, unit tests, build).
