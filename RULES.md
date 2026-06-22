# Hunch — Build Rules

> Constraints that govern every build step. Read before touching code.
> Last updated: 2026-06-21

These rules are binding for the whole MVP build. They override convenience. When a rule and a task conflict, the rule wins or the task stops for a decision.

---

## 1. Dependency safety

1. **Pin exact versions.** No `^` or `~` ranges in `package.json`. Lockfile is committed and authoritative.
2. **No fresh releases.** Do not install any npm package whose latest version was published within the last ~30 days. Recency = untested in the wild + supply-chain risk. Pick the most recent *mature* stable version instead.
3. **No untested / low-trust packages.** Prefer packages that are widely used (high weekly downloads), actively maintained, and already part of our skill ecosystem (Next.js, Prisma, Mastra, shadcn, Better Auth, TanStack Query, visx, Framer Motion).
4. **Justify every new dependency.** Before adding one: state why, confirm it is not already covered by an existing dep, and run `npm audit` — must be clean (no high/critical).
5. **No transitive surprises.** Review the lockfile diff when a dependency changes. Unexpected new transitive packages get scrutinized, not waved through.

## 2. Commit discipline (per step)

- The owner commits. Claude does **not** run `git` commands.
- A step is only ready to commit when: build passes + typecheck clean + lint clean + tests green. **Never commit red.**
- One logical step = one commit. Conventional Commits format.
- Claude's job each step: implement → make all checks green → report "ready to commit" with a suggested message. Owner reviews and commits.

## 3. Testing

- Real logic (Bayesian engine, power analysis, agent I/O schemas, safety gate) is built test-first via `superpowers:test-driven-development`.
- Any bug, test failure, or surprise → `superpowers:systematic-debugging` before proposing a fix. No guess-patching.
- Glue/scaffold code: at minimum a smoke test or typecheck gate; TDD where behavior matters.

## 4. Skill routing

Invoke the right skill when working in that area:

| Area | Skill(s) |
|---|---|
| Next.js App Router, RSC, routing, data | `next-best-practices`, `vercel-react-best-practices` |
| TS types, schemas, stats-engine generics | `typescript-advanced-types` |
| Mastra agents + workflows + tools + evals | `mastra` |
| UI components | `shadcn`, `ui-ux-pro-max` |
| Client data fetching / caching | `tanstack-query-best-practices` |
| Auth (Better Auth) | `better-auth-best-practices`, `better-auth-security-best-practices`, `create-auth-skill`, `email-and-password-best-practices` |
| DB / ORM (Prisma) | `prisma-client-api`, `prisma-cli`, `prisma-database-setup`, `prisma-postgres-setup` |
| New feature / behavior change | `superpowers:brainstorming` → `superpowers:writing-plans` |
| Verifying done work | `superpowers:verification-before-completion` |

## 5. Stack overrides (vs RESEARCH.md §8)

RESEARCH.md is the product source of truth, with two deliberate stack changes for skill support:

- **Auth: Better Auth** (was Auth.js) — dedicated skills available.
- **ORM: Prisma** (was Drizzle) — dedicated skills available.

TimescaleDB hypertables + any raw time-series SQL run *alongside* Prisma (Prisma manages the relational schema; raw SQL for Timescale specifics). Everything else in RESEARCH §8 stands.

## 6. Safety boundary (non-negotiable)

RESEARCH.md §7 is law:
- Not medical advice. Explicit disclaimers in product.
- Safety Reviewer **refuses** prescription meds, dangerous fasting, contraindicated designs → routes to "talk to a doctor."
- Safety eval is a **gate**: if it regresses, auto-approval is disabled; everything routes to manual confirm.
- Health data encrypted at rest. No PII beyond what the user enters.

## 7. Scope control

- Build strictly to MVP (RESEARCH §9). "Out" list stays out: live wearable OAuth, hierarchical/PyMC modeling, social, mobile-native.
- No unrelated refactors. Improve only the code a step actually touches.
- Plan everything up front (PLAN.md) but expand later phases just-in-time, not speculatively.
