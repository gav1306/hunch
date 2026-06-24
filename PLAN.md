# Hunch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commit policy:** The owner commits manually. Every `git` block in this plan is a **suggested command for the owner**, not for the agent. The agent's job per step: make checks green, then report "ready to commit" with the suggested message. See `RULES.md §2`.

**Goal:** Take Hunch from pre-build to a shipped MVP (RESEARCH.md §9) through small, verifiable, build→test→commit steps.

**Architecture:** Next.js (App Router) frontend + Mastra AI server + Prisma/Postgres. Stats run in a TypeScript conjugate-Bayesian engine behind a swappable interface. AI agents (Hypothesis Coach, Protocol Designer, Safety Reviewer, Adherence Companion, Analyst) are Mastra agents gated by evals. Per-user causal-graph memory feeds priors into new experiments.

**Tech Stack:** Next.js + TypeScript · Tailwind + shadcn/ui · Framer Motion + visx · TanStack Query · Mastra · Anthropic Claude (Opus/Sonnet) · Prisma + Postgres + TimescaleDB + pgvector · Better Auth · Vitest · Vercel + Fly/Railway.

**Binding rules:** `RULES.md`. **Product source of truth:** `RESEARCH.md`. **Process design:** `docs/superpowers/specs/hunch-build-process-design.md`.

---

## How this plan is structured

- **Phase 0 & Phase 1** below are **detailed, bite-sized, ready to execute**.
- **Phases 2–6** are **milestones**: goal, file map, exit criteria. Each gets expanded into its own detailed plan in `docs/superpowers/plans/` *when it is reached* (RULES §7 — no speculative detail).
- Phases are strictly ordered. A phase starts only when the previous phase's exit criteria are green and committed.

## Dependency-pinning protocol (applies to every install step)

RULES §1 forbids fresh/untested packages and requires exact pins. So for **every** `npm install`:

1. Install the package.
2. Check publish date of the resolved version: `npm view <pkg> time --json` — the resolved version's timestamp must be **older than ~30 days**. If it is newer, install the most recent version that is older than 30 days instead: `npm install <pkg>@<older-version>`.
3. Pin exact in `package.json` (strip `^`/`~`).
4. Confirm `npm audit` reports no high/critical.
5. Commit the lockfile change with the code that needs it.

This protocol is referenced as **"[PIN]"** in steps below instead of repeating it.

---

## Phase 0 — Repo & rules

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Already present: `RESEARCH.md`, `RULES.md`, `PLAN.md`, `docs/superpowers/specs/hunch-build-process-design.md`

- [ ] **Step 0.1: Owner initializes git**

Owner runs:
```bash
git init
git branch -m main
```

- [ ] **Step 0.2: Create `.gitignore`**

Create `.gitignore`:
```gitignore
# deps & build
node_modules/
.next/
dist/
build/
out/
*.tsbuildinfo

# vendored agent skills (regenerable from skills-lock.json)
.agents/

# secrets / env
.env
.env.*
!.env.example

# local db / data
*.sqlite
*.db
/postgres-data/
/data/

# logs & caches
*.log
npm-debug.log*
.turbo/
coverage/
.cache/

# os / editor
.DS_Store
.idea/
.vscode/*
!.vscode/extensions.json
```

- [ ] **Step 0.3: Create `.env.example`**

Create `.env.example` (no real secrets — placeholders only):
```bash
# Database
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/hunch?schema=public"

# Better Auth
BETTER_AUTH_SECRET="generate-with-openssl-rand-base64-32"
BETTER_AUTH_URL="http://localhost:3000"

# Anthropic
ANTHROPIC_API_KEY="sk-ant-..."
```

- [ ] **Step 0.4: Owner commits the foundation docs**

Ready-to-commit. Suggested:
```bash
git add RESEARCH.md RULES.md PLAN.md docs/ .gitignore .env.example
git commit -m "chore: init repo with research, rules, plan, and ignore files"
```

**Phase 0 exit criteria:** repo on `main`; docs + `.gitignore` + `.env.example` committed; no secrets tracked.

---

## Phase 1 — Foundation (skeleton, committed)

Goal: a running, type-checked, lint-clean, test-gated Next.js app with Prisma, Better Auth, and Mastra wired — no product features yet.

**File structure created in this phase:**
- `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs` — app config
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css` — app shell
- `components.json`, `src/components/ui/*` — shadcn
- `prisma/schema.prisma` — DB schema
- `src/lib/db.ts` — Prisma client singleton
- `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts` — Better Auth
- `src/mastra/index.ts` — Mastra server entry
- `vitest.config.ts`, `src/lib/__tests__/smoke.test.ts` — test gate
- `.github/workflows/ci.yml` — CI

### Task 1: Scaffold Next.js app

**Files:** repo root (creates `package.json`, `tsconfig.json`, `src/app/*`, configs)

- [ ] **Step 1.1: Scaffold**

Run (in repo root; it must accept an existing directory):
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```
Use the **Next.js skill** (`next-best-practices`) for App Router conventions throughout this phase.

- [ ] **Step 1.2: Apply [PIN] to all scaffolded deps**

Strip `^`/`~` in `package.json`; verify each dep's resolved version is >30 days old per [PIN]. Run `npm audit` — resolve high/critical.

- [ ] **Step 1.3: Verify dev server boots**

Run: `npm run dev`
Expected: server starts, `http://localhost:3000` renders the default page. Stop the server.

- [ ] **Step 1.4: Verify gates pass**

Run: `npx tsc --noEmit && npm run lint`
Expected: both clean.

- [ ] **Step 1.5: Owner commits**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with TypeScript, Tailwind, App Router"
```

### Task 2: Test gate (Vitest)

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/__tests__/smoke.test.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 2.1: Install Vitest**

Run: `npm install -D vitest` then apply [PIN].

- [ ] **Step 2.2: Write the failing smoke test**

Create `src/lib/__tests__/smoke.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs the test harness", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2.3: Add config + scripts**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```
Modify `package.json` scripts — add:
```json
"test": "vitest run",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 2.4: Run the test**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 2.5: Owner commits**

```bash
git add -A
git commit -m "test: add Vitest harness and smoke test"
```

### Task 3: shadcn/ui

**Files:** `components.json`, `src/components/ui/*`, `src/lib/utils.ts`

- [ ] **Step 3.1: Init shadcn**

Use the **shadcn skill**. Run: `npx shadcn@latest init` (choose defaults matching Tailwind + `src` dir). Apply [PIN] to any added deps.

- [ ] **Step 3.2: Add a baseline component**

Run: `npx shadcn@latest add button`

- [ ] **Step 3.3: Verify gates**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3.4: Owner commits**

```bash
git add -A
git commit -m "feat: init shadcn/ui with button component"
```

### Task 4: Prisma + Postgres

**Files:** `prisma/schema.prisma`, `src/lib/db.ts`, `.env` (local, untracked)

- [ ] **Step 4.1: Install + init Prisma**

Use the **Prisma skills** (`prisma-cli`, `prisma-database-setup`, `prisma-postgres-setup`, `prisma-client-api`).
Run: `npm install -D prisma && npm install @prisma/client` then apply [PIN].
Run: `npx prisma init --datasource-provider postgresql`

- [ ] **Step 4.2: Provision a local Postgres + set `DATABASE_URL`**

Owner sets a real `DATABASE_URL` in `.env` (local, untracked). Use the `prisma-postgres-setup` skill to provision if needed.

- [ ] **Step 4.3: Define the v1 schema**

Replace `prisma/schema.prisma` model section with (covers RESEARCH data needs; Better Auth tables added in Task 5):
```prisma
model Hunch {
  id          String   @id @default(cuid())
  userId      String
  rawText     String
  status      String   @default("draft") // draft | sharpened | running | concluded
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  hypothesis  Hypothesis?
  protocol    Protocol?
  checkIns    CheckIn[]
  @@index([userId])
}

model Hypothesis {
  id           String   @id @default(cuid())
  hunchId      String   @unique
  statement    String   // falsifiable hypothesis
  outcomeMetric String  // measurable outcome
  outcomeType  String   // "binary" | "continuous"
  confounders  String[] // named confounders
  createdAt    DateTime @default(now())
  hunch        Hunch    @relation(fields: [hunchId], references: [id], onDelete: Cascade)
}

model Protocol {
  id          String   @id @default(cuid())
  hunchId     String   @unique
  design      Json     // ABA / randomized n-of-1 structure: phases, washout, lengths
  powerInfo   Json?    // sample-size / power analysis output
  safetyState String   @default("pending") // pending | approved | refused
  createdAt   DateTime @default(now())
  hunch       Hunch    @relation(fields: [hunchId], references: [id], onDelete: Cascade)
}

model CheckIn {
  id        String   @id @default(cuid())
  hunchId   String
  phase     String   // which protocol phase (A / B / ...)
  value     Float    // numeric reading (1/0 for binary, measure for continuous)
  loggedAt  DateTime @default(now())
  hunch     Hunch    @relation(fields: [hunchId], references: [id], onDelete: Cascade)
  @@index([hunchId, loggedAt])
}

model CausalEdge {
  id         String   @id @default(cuid())
  userId     String
  cause      String
  effect     String
  direction  String   // "increases" | "decreases" | "none"
  effectSize Float?
  confidence Float?   // calibrated posterior confidence
  sourceHunchId String?
  createdAt  DateTime @default(now())
  @@index([userId])
}
```

- [ ] **Step 4.4: Create the Prisma client singleton**

Create `src/lib/db.ts`:
```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
```

- [ ] **Step 4.5: Generate + migrate**

Run: `npx prisma migrate dev --name init`
Expected: migration applies; client generated.

- [ ] **Step 4.6: Verify gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: clean.

- [ ] **Step 4.7: Owner commits**

```bash
git add -A
git commit -m "feat: add Prisma schema and client for hunch domain"
```

### Task 5: Better Auth

**Files:** `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts`, `prisma/schema.prisma` (auth models)

- [ ] **Step 5.1: Install + configure**

Use the **Better Auth skills** (`create-auth-skill`, `better-auth-best-practices`, `better-auth-security-best-practices`, `email-and-password-best-practices`).
Run: `npm install better-auth` then apply [PIN].
Follow `create-auth-skill` to: add the Prisma adapter, generate auth tables into `prisma/schema.prisma`, run `npx prisma migrate dev --name auth`, create `src/lib/auth.ts` (server) + `src/lib/auth-client.ts` (client) + the `[...all]` route handler. Enable email/password per `email-and-password-best-practices`. Apply `better-auth-security-best-practices` (secret, trusted origins, rate limiting).

- [ ] **Step 5.2: Verify gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: clean.

- [ ] **Step 5.3: Verify auth route responds**

Run `npm run dev`, then confirm the auth API route is mounted (no 404 on the Better Auth base path). Stop the server.

- [ ] **Step 5.4: Owner commits**

```bash
git add -A
git commit -m "feat: add Better Auth with email/password and Prisma adapter"
```

### Task 6: Mastra server wiring

**Files:** `src/mastra/index.ts`, `.env` (ANTHROPIC_API_KEY)

- [ ] **Step 6.1: Install Mastra**

Use the **mastra skill**. Install the Mastra packages per the skill, then apply [PIN].

- [ ] **Step 6.2: Create the Mastra entry**

Create `src/mastra/index.ts` registering an empty Mastra instance (no agents yet — agents land in Phase 2+). Follow the `mastra` skill for the exact current API.

- [ ] **Step 6.3: Verify gates**

Run: `npm run typecheck && npm run lint && npm test`
Expected: clean.

- [ ] **Step 6.4: Owner commits**

```bash
git add -A
git commit -m "feat: wire Mastra server entry point"
```

### Task 7: CI gate

**Files:** `.github/workflows/ci.yml`

- [ ] **Step 7.1: Add CI workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
```
Apply [PIN] reasoning to the pinned action SHAs/major versions where relevant.

- [ ] **Step 7.2: Owner commits**

```bash
git add -A
git commit -m "ci: add typecheck, lint, and test gate"
```

**Phase 1 exit criteria:** app boots; `npm run typecheck && npm run lint && npm test` all green; Prisma migrates clean; Better Auth email/password works; Mastra entry loads; CI workflow present. All committed.

---

## Phase 2 — First vertical slice (MILESTONE — expand when reached)

**Goal:** Drop a hunch → Hypothesis Coach agent sharpens it → render a Hunch Card. Proves the core loop end-to-end.

**File map (anticipated):**
- `src/mastra/agents/hypothesis-coach.ts` — agent: vague hunch → falsifiable hypothesis + outcome metric + confounders
- `src/mastra/agents/__tests__/hypothesis-coach.test.ts` — agent I/O schema + eval tests (TDD)
- `src/lib/schemas/hypothesis.ts` — zod schemas for agent I/O (use `typescript-advanced-types`)
- `src/app/hunch/new/page.tsx` — drop-a-hunch input
- `src/app/api/hunch/route.ts` — create hunch + invoke coach
- `src/components/hunch-card.tsx` — flippable Hunch Card (use `shadcn`, `ui-ux-pro-max`, Framer Motion)
- `src/hooks/use-hunch.ts` — TanStack Query hook (use `tanstack-query-best-practices`)

**Eval:** Hypothesis-quality eval (is the sharpened hypothesis falsifiable + measurable?) — RESEARCH §5.

**Exit criteria:** user drops free-text hunch, gets a sharpened falsifiable hypothesis persisted to DB, sees it rendered as a Hunch Card; hypothesis-quality eval passes; all gates green.

---

## Phase 3 — Protocol + Safety gate (MILESTONE — expand when reached)

**Goal:** Protocol Designer produces an ABA / randomized n-of-1 design; Safety Reviewer gates it (can refuse).

**File map (anticipated):**
- `src/mastra/agents/protocol-designer.ts`
- `src/mastra/agents/safety-reviewer.ts`
- `src/mastra/tools/power-analysis.ts` — deterministic sample-size/power tool (no LLM math)
- `src/mastra/tools/confounder-detection.ts`
- `src/mastra/workflows/design.ts` — hunch → hypothesis → protocol → safety gate → approved
- `src/mastra/evals/safety.eval.ts` — **gate** (RESEARCH §7): regression disables auto-approval
- `src/app/hunch/[id]/protocol/page.tsx` — phase track UI (timeline + now-marker)

**Open question to resolve here:** confounder handling v1 — surface-and-warn vs attempt-to-adjust (RESEARCH §10).

**Exit criteria:** approved protocols render a phase track; risky designs (meds/fasting/contraindicated) are refused and routed to "talk to a doctor"; safety eval gate passes; all gates green.

---

## Phase 4 — Check-ins + Bayesian engine + live belief meter (MILESTONE — expand when reached)

**Goal:** One-tap daily check-ins feed a TS conjugate Bayesian engine; a belief meter narrows live.

**File map (anticipated):**
- `src/lib/bayes/model.ts` — `BayesianModel` interface (swappable; RESEARCH §6)
- `src/lib/bayes/beta-binomial.ts` — binary outcomes
- `src/lib/bayes/normal-normal.ts` — continuous outcomes
- `src/lib/bayes/__tests__/*.test.ts` — **TDD-first**, closed-form math verified against known values (use `typescript-advanced-types`)
- `src/mastra/tools/bayesian-update.ts` — deterministic update tool
- `src/components/belief-meter.tsx` — visx credible-interval viz, Framer Motion animation (signature UI)
- `src/components/check-in.tsx` — one-tap swipe/tap check-in (no forms — hard constraint, RESEARCH §4)
- `src/app/api/check-in/route.ts`

**Exit criteria:** logging a check-in updates the posterior instantly; belief meter visibly narrows/shifts; engine math has unit tests passing against analytic expectations; all gates green.

---

## Phase 5 — Analyst verdict + Calibration eval (MILESTONE — expand when reached)

**Goal:** Analyst writes a plain-English verdict with calibrated confidence + effect size; calibration is eval-gated.

**File map (anticipated):**
- `src/mastra/agents/analyst.ts`
- `src/mastra/workflows/analysis.ts` — data → stats tool → Bayesian update → narrative verdict
- `src/mastra/evals/calibration.eval.ts` — Brier score (RESEARCH §5)
- `src/components/verdict.tsx` — verdict + "inconclusive as a result" presentation

**Open questions to resolve here (RESEARCH §10):** default trial length / minimum data before a verdict; how to present "inconclusive" as a result not a failure.

**Exit criteria:** concluded experiments show a calibrated verdict + effect size; "inconclusive" reads as a legitimate outcome; calibration eval passes; all gates green.

---

## Phase 6 — Causal-graph memory (MILESTONE — expand when reached)

**Goal:** Confirmed findings become priors read into new hunches.

**File map (anticipated):**
- `src/lib/memory/causal-graph.ts` — read/write `CausalEdge`s
- `src/lib/memory/priors.ts` — surface relevant priors for a new hunch (pgvector recall)
- integrate into `src/mastra/agents/hypothesis-coach.ts` — inject known priors

**Exit criteria:** a new hunch related to a prior finding surfaces that prior ("you already learned X"); recall is relevant; all gates green.

---

## Out of scope (MVP — RESEARCH §9)

Live wearable OAuth/webhooks (Oura/Whoop), hierarchical/PyMC modeling, social/sharing, mobile-native. Do not build.
