# Hunch — Build Process Design

> Design for *how* we build Hunch: the governing rules and the phased, slice-by-slice plan.
> This is a process/meta spec. Product spec is `RESEARCH.md`. Build rules are `RULES.md`.
> Date: 2026-06-21

## Goal

Take Hunch from pre-build (RESEARCH.md done) to a shipped MVP through small, verifiable steps. Every step: **build → test green → owner commits**. Before any code, the rules are written down and the full MVP is planned phase-by-phase.

## Artifacts produced by this design

1. **`RULES.md`** (done) — binding build constraints: dependency safety, commit discipline, testing, skill routing, stack overrides, safety boundary, scope control.
2. **`PLAN.md`** (next, via `writing-plans`) — the full ordered MVP plan; Phase 0–1 detailed step-by-step, Phases 2–6 as milestones expanded just-in-time.

## Key decisions

| Decision | Choice | Why |
|---|---|---|
| Plan depth | Full MVP, slice-by-slice | Owner wants the whole map; early phases deep, later sketched. |
| Auth | **Better Auth** (override of RESEARCH §8 Auth.js) | Dedicated skills available. |
| ORM | **Prisma** (override of RESEARCH §8 Drizzle) | Dedicated skills available; raw SQL still used for TimescaleDB. |
| Commits | Owner commits manually | Owner's explicit preference; Claude never runs git. |
| Stats | TS conjugate Bayesian (unchanged) | RESEARCH §6 stands. |

## Build discipline (the loop)

For every step in PLAN.md:

1. Pick the next step.
2. Invoke the relevant skill(s) per `RULES.md §4`.
3. Implement (TDD for real logic per `RULES.md §3`).
4. Make it green: build + typecheck + lint + tests.
5. Report "ready to commit" with a suggested Conventional Commit message.
6. Owner reviews and commits.
7. Next step.

No step starts before the previous is green and committed. No red commits. No speculative work.

## Phased plan (overview — full detail lands in PLAN.md)

**Phase 0 — Repo & rules**
Owner runs `git init`, adds `.gitignore`. Commit `RESEARCH.md`, `RULES.md`, this spec.

**Phase 1 — Foundation (skeleton, committed)**
- Next.js (App Router) + TS + Tailwind + shadcn scaffold.
- Prisma + Postgres; schema for hunches, hypotheses, protocols, check-ins, causal-graph memory.
- Better Auth wired.
- Mastra server wiring.
- CI gate: typecheck + lint + test.

**Phase 2 — First vertical slice (deep)**
Drop a hunch → Hypothesis Coach agent sharpens → render Hunch Card. Proves the core loop end-to-end. Each sub-step TDD'd.

**Phase 3 — Protocol + Safety gate**
Protocol Designer agent (ABA/randomized n-of-1). Safety Reviewer agent + safety eval as a hard gate.

**Phase 4 — Check-ins + Bayesian engine + live belief meter**
TS conjugate engine (Beta-Binomial, Normal-Normal) behind a `BayesianModel` interface. One-tap daily check-ins. visx belief meter that narrows live.

**Phase 5 — Analyst verdict + Calibration eval**
Analyst agent writes plain-English verdict + calibrated confidence + effect size. Brier-score calibration eval.

**Phase 6 — Causal-graph memory**
Confirmed findings become priors read into new hunches.

Phases 2–6 each expand into ordered build→test→commit steps when reached.

## Out of scope (MVP — per RESEARCH §9)

Live wearable OAuth/webhooks, hierarchical/PyMC modeling, social/sharing, mobile-native.

## Open questions (carried from RESEARCH §10, resolve when their phase arrives)

- Default trial length / minimum data before a verdict is offered? (Phase 5)
- How to present "inconclusive" as a *result*, not a failure? (Phase 5)
- Confounder handling at v1 — surface-and-warn vs attempt-to-adjust? (Phase 3)
