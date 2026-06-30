# Phase 4 — Check-ins + Bayesian engine + live belief meter (Design Spec)

> Status: draft 2026-06-30. Expands the Phase 4 milestone in `PLAN.md`.
> Binding constraints: `RULES.md` (esp. §3 TDD / no LLM arithmetic, §7 scope).
> Product source of truth: `RESEARCH.md` (belief meter, n-of-1 analysis).

## Goal

After a protocol is approved and the hunch is `running` (Phase 3), the user logs
**one-tap daily check-ins** against the current ABA phase. A **pure-TS Bayesian
engine** (conjugate models) computes a posterior on each read, and a **live belief
meter** shows `P(effect > 0)` as a headline number with a credible interval that
**narrows as evidence accumulates**. No LLM touches the math (RULES §3).

## Resolved decisions

- **Belief meter = headline probability + supporting interval.** Big `P(effect>0)`
  as a 0–100% number ("78% likely real"), with a credible-interval bar underneath
  centered at zero. The interval is the honesty: a bar straddling 0 reads as
  uncertain, a bar fully to one side reads as confident. Hand-rolled SVG/CSS — **no
  new charting dependency** (no visx), matching the project's tight-deps culture.
- **Engine = both conjugate models behind one interface.** `Beta-Binomial` for
  binary outcomes, `Normal-Normal` for continuous, both implementing a single
  `BayesianModel` interface. Pure TS, heavily unit-tested, in the same spirit as the
  deterministic `src/mastra/tools/` from Phase 3.
- **Normal-Normal uses an empirically-pooled σ (MVP simplification).** Rather than a
  full Normal-Inverse-Gamma treatment of unknown variance, v1 estimates σ from the
  pooled sample. Pragmatic and defensible for an MVP; the interface leaves room to
  upgrade to NIG later with no caller change.
- **Stateless compute-on-read (no stored belief snapshots).** The posterior is a
  pure function of the check-in set. A `GET` reads all check-ins and runs the engine
  fresh on every page load. "Narrows live" is achieved by recomputing as points
  accumulate — there is no belief table to keep in sync. Determinism (below) makes
  this flicker-free.
- **Auto phase tracking from the schedule.** The user never picks a phase. A pure-TS
  schedule calculator maps `today − Protocol.startedAt` to the current ABA phase
  (honoring per-phase `days` and `washoutDays`). True one-tap.
- **One check-in per hunch per day, overwrite, gaps OK.** A unique
  `[hunchId, loggedOn]` constraint enforces one row per calendar day; re-logging the
  same day overwrites. Missed days are simply gaps — no penalty, no backfill prompt.

## Architecture / data flow

```
hunch (status: running, has approved Protocol with startedAt)
  POST /checkin:
    schedule.currentPhase(startedAt, design, today) → phase | washout | done
    → upsert CheckIn(hunchId, loggedOn, phase, value)   (overwrite same day)
    → recompute belief inline → 201 { checkIn, belief }

  GET /belief:
    read all CheckIns → split by phase.kind (baseline=A-arm, intervention=B-arm)
    → pick model by hypothesis.outcomeType
    → engine.update(aArm, bArm) → Belief
    → 200 { belief, checkIns, schedule }
```

Division of labor (RULES §3 — no LLM arithmetic):
- **Engine** does all probability/statistics deterministically, unit-tested.
- **Schedule calculator** does all date→phase mapping deterministically, unit-tested.
- **No agent involved in Phase 4.** This phase is pure computation over Phase 3 output.

## Components

Each unit has one purpose, a typed interface, and is independently testable.

### Data model — `prisma/schema.prisma`
- `Protocol.startedAt DateTime?` — set when `safetyState` resolves to `approved` and
  the hunch flips to `running` (the existing Phase 3 approval path). Anchors the
  schedule. Nullable because a pending/refused protocol never started.
- `CheckIn` gains `loggedOn` (calendar date, `@db.Date`) and a unique
  `@@unique([hunchId, loggedOn])`. `loggedAt` (timestamp) is retained for ordering.
  `phase` continues to store the derived phase label at write time.

### Schemas — `src/lib/schemas/belief.ts`
zod schemas (mirror the Phase 2/3 schema style):
- `checkInInputSchema` — `{ value: number }`. Client sends only the reading; phase and
  date are derived server-side, never trusted from the client.
- `beliefSchema` — engine output:
  `{ pEffect: number (0..1), effect: number, ci: [number, number], nA: number,
     nB: number, model: "beta-binomial" | "normal-normal",
     state: "warming-up" | "live" }`.
  `warming-up` when either arm has < 3 observations.

### Bayesian engine — `src/lib/bayes/`
- `BayesianModel` interface: `update(a: number[], b: number[]): Belief`.
- **Beta-Binomial** (`beta-binomial.ts`): prior `Beta(1,1)` per arm; posterior
  `Beta(1 + successes, 1 + failures)`. `effect = mean(B) − mean(A)`.
  `pEffect = P(θ_B > θ_A)` and `ci` are computed from sampled `θ_B − θ_A` draws.
- **Normal-Normal** (`normal-normal.ts`): per-arm posterior mean is Normal; σ is
  estimated empirically from the pooled sample (MVP). `effect = μ_B − μ_A`,
  `pEffect = Φ(effect / se)`, `ci` from `se`.
- **Determinism:** a tiny inline seeded PRNG (xorshift/LCG) drives the Monte-Carlo
  draws so an identical check-in set always yields an identical posterior — no flicker
  on reload under compute-on-read. (Normal-Normal is closed-form, already deterministic.)
- `state: "warming-up"` when either arm < 3 points; the engine still returns numbers,
  the UI shows "gathering data."

### Schedule calculator — `src/lib/schedule.ts`
- `currentPhase(startedAt, design, today)` →
  `{ phase: "A" | "B" | null, kind, label, dayInPhase, washout, done }`.
- Walks `design.phases` in order, inserting `design.washoutDays` between phases. Maps
  `today − startedAt` (whole days) to a segment. Washout day → `washout: true` (no
  check-in counted). Past the last phase → `done: true`, `phase: null`.

### API routes
- `POST /api/hunch/[id]/checkin` — 401 unauth · 404 not found/owned · 409 when status
  ≠ `running`, on washout days, or after trial end · 201 `{ checkIn, belief }`.
  Validates body with `checkInInputSchema`, derives phase via the schedule, upserts on
  `[hunchId, loggedOn]`, recomputes belief inline.
- `GET /api/hunch/[id]/belief` — 401 · 404 · 200 `{ belief, checkIns, schedule }`.
  Compute-on-read: reads all check-ins, runs the engine, returns today's schedule so
  the UI knows whether logging is open.

### Hooks — `src/hooks/`
- `useBelief(hunchId)` — `useQuery` on `GET /belief`; the live-meter source.
- `useCheckIn(hunchId)` — `useMutation` on `POST /checkin`; `onSuccess` invalidates
  `['belief', hunchId]` so the meter narrows immediately after each tap.

### UI — `src/app/hunch/[id]/page.tsx` + components
- `belief-meter.tsx` — headline `pEffect` (0–100%) + a hand-rolled SVG/CSS credible-
  interval bar on a zero-centered axis. `warming-up` → muted "Gathering data — keep
  logging."
- `checkin-tap.tsx` — reads `schedule`. Binary → two big buttons (Yes/No → 1/0).
  Continuous → number input + log. Shows today's phase chip, washout "rest day," and
  "trial done" (a Phase 5 hand-off). Re-tap overwrites with "logged ✓."

## Testing (RULES §3 TDD)
- **Engine**: known-input posteriors (e.g. 9/10 vs 1/10 → high `pEffect`), prior-only →
  `pEffect ≈ 0.5`, determinism (same input twice → byte-identical), continuous mean/se.
- **Schedule**: each phase-boundary day, washout edges, pre-start, post-end.
- **Schemas**: valid/invalid check-in values, belief shape.
- **Routes**: 401/404/409 (washout, not-running, after-end) and 201 overwrite paths.
- **Errors**: engine never throws on empty/short data → returns `warming-up`; bad
  protocol JSON → 500 with logged cause.

## Known simplifications (v1, called out for honesty)
- **Pooled baselines.** ABA has two baseline (A) phases; v1 pools both into one
  A-arm and treats observations as exchangeable. This ignores time trend and
  carryover between the first and returned baseline. Acceptable for an MVP meter;
  a carryover-aware model is a later upgrade behind the same interface.
- **UTC date bucketing.** `loggedOn` is the UTC calendar date. A check-in near local
  midnight may bucket to the adjacent day. Per-user timezone is deferred; UTC keeps
  the unique-constraint logic simple and deterministic server-side.
- **`P(effect>0)` is raw, direction-agnostic.** The meter reports the probability the
  intervention arm mean exceeds the baseline arm mean. Whether "higher" is good or bad
  depends on the outcome; v1 shows the raw quantity and leaves directional framing
  ("X% likely to help") to the Phase 5 Analyst verdict.
- **`startedAt` is a new field + a Phase 3 route change.** The approval path that flips
  the hunch to `running` must also set `Protocol.startedAt`; this is an explicit edit
  to the Phase 3 protocol route, not pre-existing behavior.

## Out of scope (Phase 5+)
- Analyst verdict + Brier calibration (Phase 5).
- Causal-graph memory / `CausalEdge` writes (Phase 6).
- Full Normal-Inverse-Gamma variance modeling (interface leaves room).
- Confounder statistical adjustment (structured rows already persisted in Phase 3).
