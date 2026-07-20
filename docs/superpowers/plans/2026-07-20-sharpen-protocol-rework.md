# Sharpen → Protocol Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the one-shot sharpen into a conversational coach (≤3 tappable clarifying questions), auto-design a tailored protocol on its own page, and fix overflow/theme across the flow.

**Architecture:** Two agents — a new `clarifier` that asks hunch-specific questions, and the existing `hypothesis-coach` now fed the user's answers. A new pre-hunch `POST /api/hunch/clarify` route returns questions; `POST /api/hunch` gains an `answers` field. Protocol phases carry a human `name` + `action` so plans read tailored, not templated. The protocol page auto-designs on mount.

**Tech Stack:** Next.js 16 (App Router, client components), Mastra agents on Amazon Bedrock (Claude Sonnet 5), Zod schemas, TanStack Query mutations, Prisma/Postgres, Vitest (unit + `.eval` live-model suites), inline-style brand system (`appThemeStyle`, Clash Display / Space Mono, `--ink/--paper/--rule/--s1/--s2`).

## Global Constraints

- No LLM math — trial length stays in the deterministic `power-analysis` tool.
- Every API route: auth-guard first, `safeParse` the body, always answer JSON (never an empty body on error).
- Agents: use the shared `claudeModel`; force schema via `structuredOutput: { schema }`; cap `maxOutputTokens`.
- `.eval` tests self-skip without AWS creds: `const hasKey = Boolean(process.env.AWS_PROFILE || process.env.AWS_ACCESS_KEY_ID)` + `describe.skipIf(!hasKey)`.
- Brand UI only on user-facing screens — inline styles + theme tokens, no shadcn `Button`/Tailwind utilities.
- Schema invariants must never hard-500 a page: deterministic fallback fills any field the model omits.
- Commit after every green task.
- No `Co-Authored-By` / `Generated-with` trailers on commits.
- Custom Prisma client: after any schema change run `npx prisma generate`, clear `.next`, restart dev.

---

### Task 1: Clarifying-questions schemas

**Files:**
- Create: `src/lib/schemas/clarify.ts`
- Test: `src/lib/schemas/clarify.test.ts`

**Interfaces:**
- Produces: `clarifyingQuestionSchema`, `clarifyingQuestionsSchema`, `clarifyingAnswerSchema`, `sharpenRequestSchema`; types `ClarifyingQuestion`, `ClarifyingQuestions`, `ClarifyingAnswer`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/schemas/clarify.test.ts
import { describe, expect, it } from "vitest";
import {
  clarifyingQuestionsSchema,
  clarifyingAnswerSchema,
  sharpenRequestSchema,
} from "./clarify";

describe("clarify schemas", () => {
  it("accepts 1-3 questions with 2-4 options each", () => {
    const ok = clarifyingQuestionsSchema.safeParse({
      questions: [
        { id: "outcome", prompt: "How do you notice bad sleep?", options: ["falling asleep", "waking up"], allowOther: true },
      ],
    });
    expect(ok.success).toBe(true);
  });

  it("rejects more than 3 questions", () => {
    const q = { id: "x", prompt: "p", options: ["a", "b"], allowOther: false };
    const bad = clarifyingQuestionsSchema.safeParse({ questions: [q, q, q, q] });
    expect(bad.success).toBe(false);
  });

  it("rejects a question with fewer than 2 options", () => {
    const bad = clarifyingQuestionsSchema.safeParse({
      questions: [{ id: "x", prompt: "p", options: ["only"], allowOther: false }],
    });
    expect(bad.success).toBe(false);
  });

  it("answer carries id, prompt, and answer text", () => {
    const ok = clarifyingAnswerSchema.safeParse({ id: "outcome", prompt: "How?", answer: "waking up" });
    expect(ok.success).toBe(true);
  });

  it("sharpenRequest defaults answers to an empty array", () => {
    const parsed = sharpenRequestSchema.parse({ rawText: "coffee wrecks sleep" });
    expect(parsed.answers).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/schemas/clarify.test.ts`
Expected: FAIL — cannot resolve `./clarify`.

- [ ] **Step 3: Write the schema**

```ts
// src/lib/schemas/clarify.ts
import { z } from "zod";

/**
 * The Clarifier's output. One hunch-specific question: a prompt, 2-4 tappable
 * options, and whether a free-text "other" answer is allowed. `id` is a stable
 * slug (e.g. "outcome") used to key answers.
 */
export const clarifyingQuestionSchema = z.object({
  id: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  options: z.array(z.string().trim().min(1)).min(2).max(4),
  allowOther: z.boolean(),
});
export type ClarifyingQuestion = z.infer<typeof clarifyingQuestionSchema>;

/** At most three questions — never overwhelm the user. */
export const clarifyingQuestionsSchema = z.object({
  questions: z.array(clarifyingQuestionSchema).min(1).max(3),
});
export type ClarifyingQuestions = z.infer<typeof clarifyingQuestionsSchema>;

/**
 * A resolved answer fed back to the coach. Carries the prompt text (not just the
 * id) so the coach has full context for an accurate hypothesis.
 */
export const clarifyingAnswerSchema = z.object({
  id: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  answer: z.string().trim().min(1),
});
export type ClarifyingAnswer = z.infer<typeof clarifyingAnswerSchema>;

/** Body of POST /api/hunch — raw hunch plus any clarifying answers. */
export const sharpenRequestSchema = z.object({
  rawText: z.string().trim().min(1, "A hunch can't be empty."),
  answers: z.array(clarifyingAnswerSchema).default([]),
});
export type SharpenRequest = z.infer<typeof sharpenRequestSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/schemas/clarify.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/schemas/clarify.ts src/lib/schemas/clarify.test.ts
git commit -m "feat(schemas): clarifying-question + sharpen-request schemas"
```

---

### Task 2: Clarifier agent

**Files:**
- Create: `src/mastra/agents/clarifier.ts`
- Test (eval): `src/mastra/agents/clarifier.eval.test.ts`

**Interfaces:**
- Consumes: `clarifyingQuestionsSchema`, `ClarifyingQuestions` (Task 1); `claudeModel`; `Prior`.
- Produces: `export const clarifier`; `export async function askClarifying(rawText: string, priors?: Prior[]): Promise<ClarifyingQuestions>`.

- [ ] **Step 1: Write the failing eval test**

```ts
// src/mastra/agents/clarifier.eval.test.ts
import { describe, expect, test } from "vitest";
import { askClarifying } from "@/mastra/agents/clarifier";
import { clarifyingQuestionsSchema } from "@/lib/schemas/clarify";

const hasKey = Boolean(process.env.AWS_PROFILE || process.env.AWS_ACCESS_KEY_ID);

describe.skipIf(!hasKey)("Clarifier quality", () => {
  test("asks <=3 valid, on-topic questions for a vague hunch", async () => {
    const out = await askClarifying("coffee wrecks my sleep");
    expect(clarifyingQuestionsSchema.safeParse(out).success).toBe(true);
    expect(out.questions.length).toBeGreaterThanOrEqual(1);
    expect(out.questions.length).toBeLessThanOrEqual(3);
    for (const q of out.questions) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(4);
    }
  }, 60_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config vitest.eval.config.ts src/mastra/agents/clarifier.eval.test.ts`
Expected: FAIL — cannot resolve `@/mastra/agents/clarifier` (or SKIP if no AWS creds; if skipped, still proceed — the unit-safe parts are covered by Task 1).

- [ ] **Step 3: Write the agent**

```ts
// src/mastra/agents/clarifier.ts
import { Agent } from "@mastra/core/agent";
import { claudeModel } from "@/mastra/model";
import {
  clarifyingQuestionsSchema,
  type ClarifyingQuestions,
} from "@/lib/schemas/clarify";
import type { Prior } from "@/lib/schemas/prior";

/**
 * The Clarifier (RESEARCH §3, pre-coach). Reads a vague hunch and asks at most
 * three tappable questions that materially sharpen it — the outcome, how it's
 * measured, and the exact intervention/dose. The answers feed the Hypothesis
 * Coach so it commits an accurate hypothesis instead of guessing.
 *
 * Runs on the shared Claude Sonnet 5 (Bedrock) model. See src/mastra/model.ts.
 */
export const clarifier = new Agent({
  id: "clarifier",
  name: "Clarifier",
  model: claudeModel,
  instructions: `You are the Clarifier for Hunch, a personal-science copilot.

A user drops a vague hunch about their life ("coffee wrecks my sleep"). Before
it can become a testable hypothesis, you ask the FEW questions that most sharpen
it. Do not restate the hunch. Do not give advice.

Rules:
- Ask AT MOST 3 questions. Fewer is better. Only ask what genuinely changes the
  hypothesis: what outcome moves, how they'd measure it, and the exact
  intervention (dose, timing, "entirely vs partly").
- Each question offers 2-4 concrete, tappable options phrased in the user's own
  world (for sleep: "trouble falling asleep", "waking at night", "groggy
  mornings"). Options must be distinct and realistic.
- Set allowOther true when a sensible answer might fall outside your options.
- id: a short stable slug for the question ("outcome", "measure", "dose").
- Never ask about medical history or anything a doctor should handle.`,
});

/**
 * Ask the clarifying questions for a raw hunch. Priors (past findings) are
 * passed so the questions don't re-litigate what the user already knows.
 */
export async function askClarifying(
  rawText: string,
  priors: Prior[] = [],
): Promise<ClarifyingQuestions> {
  const priorsBlock =
    priors.length > 0
      ? `\n\nThe user already learned these related findings; don't ask about them again:\n${priors
          .map((p) => `- ${p.cause} (${p.direction}, ${Math.round(p.confidence * 100)}% confident)`)
          .join("\n")}`
      : "";

  const response = await clarifier.generate(
    `Ask the clarifying questions for this hunch:\n\n"${rawText}"${priorsBlock}`,
    {
      structuredOutput: { schema: clarifyingQuestionsSchema },
      modelSettings: { maxOutputTokens: 1024 },
    },
  );

  return clarifyingQuestionsSchema.parse(response.object);
}
```

- [ ] **Step 4: Run the eval (or typecheck if skipped)**

Run: `npx vitest run --config vitest.eval.config.ts src/mastra/agents/clarifier.eval.test.ts`
Expected: PASS with AWS creds; SKIP without. Either way run `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/mastra/agents/clarifier.ts src/mastra/agents/clarifier.eval.test.ts
git commit -m "feat(agent): clarifier asks <=3 tappable questions per hunch"
```

---

### Task 3: Clarify API route + client hook

**Files:**
- Create: `src/app/api/hunch/clarify/route.ts`
- Create: `src/hooks/use-clarify.ts`
- Test: `src/app/api/hunch/clarify/route.test.ts`

**Interfaces:**
- Consumes: `askClarifying` (Task 2); `hunchInputSchema` (existing); `auth`, `recallPriors`.
- Produces: `POST /api/hunch/clarify` → `{ questions }`; `useClarify()` mutation `(rawText: string) => Promise<ClarifyingQuestion[]>`.

- [ ] **Step 1: Write the failing route test**

```ts
// src/app/api/hunch/clarify/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/lib/memory/recall", () => ({ recallPriors: vi.fn(async () => []) }));
vi.mock("@/mastra/agents/clarifier", () => ({ askClarifying: vi.fn() }));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { askClarifying } from "@/mastra/agents/clarifier";

const req = (body: unknown) =>
  new Request("http://t/api/hunch/clarify", { method: "POST", body: JSON.stringify(body) });

describe("POST /api/hunch/clarify", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401s when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    const res = await POST(req({ rawText: "x" }));
    expect(res.status).toBe(401);
  });

  it("400s on empty hunch", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await POST(req({ rawText: "" }));
    expect(res.status).toBe(400);
  });

  it("returns questions on success", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(askClarifying).mockResolvedValue({
      questions: [{ id: "outcome", prompt: "How?", options: ["a", "b"], allowOther: true }],
    });
    const res = await POST(req({ rawText: "coffee wrecks sleep" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/hunch/clarify/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Write the route**

```ts
// src/app/api/hunch/clarify/route.ts
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recallPriors } from "@/lib/memory/recall";
import { hunchInputSchema } from "@/lib/schemas/hypothesis";
import { askClarifying } from "@/mastra/agents/clarifier";

/**
 * Pre-hunch step: given raw text, the Clarifier returns <=3 tappable questions.
 * Creates nothing — the Hunch row is written later by POST /api/hunch once the
 * user has answered and the coach commits a hypothesis.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = hunchInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "A hunch can't be empty." }, { status: 400 });
  }

  try {
    const priors = await recallPriors(session.user.id, parsed.data.rawText);
    const { questions } = await askClarifying(parsed.data.rawText, priors);
    return NextResponse.json({ questions }, { status: 200 });
  } catch (err) {
    console.error("[clarify] failed:", err);
    return NextResponse.json(
      { error: "Couldn't think of questions right now." },
      { status: 502 },
    );
  }
}
```

- [ ] **Step 4: Write the client hook**

```ts
// src/hooks/use-clarify.ts
"use client";

import { useMutation } from "@tanstack/react-query";
import type { ClarifyingQuestion } from "@/lib/schemas/clarify";

async function postClarify(rawText: string): Promise<ClarifyingQuestion[]> {
  const res = await fetch("/api/hunch/clarify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawText }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(body?.questions)) {
    throw new Error(body?.error ?? "Couldn't think of questions right now.");
  }
  return body.questions as ClarifyingQuestion[];
}

/** Ask the coach's clarifying questions for a raw hunch. */
export function useClarify() {
  return useMutation({ mutationFn: postClarify });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/app/api/hunch/clarify/route.test.ts`
Expected: PASS (3 tests). Then `npm run typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/hunch/clarify src/hooks/use-clarify.ts
git commit -m "feat(api): POST /api/hunch/clarify + useClarify hook"
```

---

### Task 4: Thread answers into the coach + create route

**Files:**
- Modify: `src/mastra/agents/hypothesis-coach.ts` (signature of `sharpenHunch`)
- Modify: `src/app/api/hunch/route.ts` (parse `answers`, pass through)
- Modify: `src/hooks/use-create-hunch.ts` (send `answers`)
- Test: `src/mastra/agents/hypothesis-coach.test.ts`

**Interfaces:**
- Consumes: `ClarifyingAnswer`, `sharpenRequestSchema` (Task 1).
- Produces: `sharpenHunch(rawText: string, priors?: Prior[], answers?: ClarifyingAnswer[]): Promise<SharpenedHypothesis>`; `useCreateHunch()` mutation now takes `{ rawText, answers }`.

- [ ] **Step 1: Write the failing unit test**

```ts
// src/mastra/agents/hypothesis-coach.test.ts
import { describe, expect, it, vi } from "vitest";

const generate = vi.fn();
vi.mock("@/mastra/agents/hypothesis-coach", async (orig) => orig());
vi.mock("@mastra/core/agent", () => ({
  Agent: class {
    generate = generate;
  },
}));
vi.mock("@/mastra/model", () => ({ claudeModel: {} }));

import { buildSharpenPrompt } from "@/mastra/agents/hypothesis-coach";

describe("buildSharpenPrompt", () => {
  it("includes the raw hunch", () => {
    const p = buildSharpenPrompt("coffee wrecks sleep", [], []);
    expect(p).toContain("coffee wrecks sleep");
  });

  it("folds clarifying answers in as ground truth", () => {
    const p = buildSharpenPrompt("coffee wrecks sleep", [], [
      { id: "measure", prompt: "How would you track it?", answer: "sleep score" },
    ]);
    expect(p).toContain("sleep score");
    expect(p).toContain("How would you track it?");
  });

  it("omits the answers block when there are none", () => {
    const p = buildSharpenPrompt("x", [], []);
    expect(p.toLowerCase()).not.toContain("ground truth");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/mastra/agents/hypothesis-coach.test.ts`
Expected: FAIL — `buildSharpenPrompt` not exported.

- [ ] **Step 3: Extract + extend the prompt builder in `hypothesis-coach.ts`**

Replace the body of `sharpenHunch` and add an exported `buildSharpenPrompt`. Add the import at the top:

```ts
import type { ClarifyingAnswer } from "@/lib/schemas/clarify";
```

Then:

```ts
/**
 * Build the coach prompt from the raw hunch, any recalled priors, and the
 * user's clarifying answers. Extracted + exported so it is unit-testable
 * without a live model call.
 */
export function buildSharpenPrompt(
  rawText: string,
  priors: Prior[],
  answers: ClarifyingAnswer[],
): string {
  const priorsBlock =
    priors.length > 0
      ? `\n\nThe user has already learned these related findings; take them into account, do not contradict them:\n${priors
          .map((p) => `- ${p.cause} (${p.direction}, ${Math.round(p.confidence * 100)}% confident)`)
          .join("\n")}`
      : "";

  const answersBlock =
    answers.length > 0
      ? `\n\nThe user answered these clarifying questions — treat them as ground truth:\n${answers
          .map((a) => `- ${a.prompt} -> ${a.answer}`)
          .join("\n")}`
      : "";

  return `Sharpen this hunch into a testable hypothesis:\n\n"${rawText}"${answersBlock}${priorsBlock}`;
}

export async function sharpenHunch(
  rawText: string,
  priors: Prior[] = [],
  answers: ClarifyingAnswer[] = [],
): Promise<SharpenedHypothesis> {
  const response = await hypothesisCoach.generate(
    buildSharpenPrompt(rawText, priors, answers),
    {
      structuredOutput: { schema: sharpenedHypothesisSchema },
      modelSettings: { maxOutputTokens: 1024 },
    },
  );

  return sharpenedHypothesisSchema.parse(response.object);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/mastra/agents/hypothesis-coach.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire `answers` through the create route**

In `src/app/api/hunch/route.ts`: swap the import + parse, and pass `answers` to `sharpenHunch`.

```ts
// change import:
import { sharpenRequestSchema } from "@/lib/schemas/clarify";
// ...
const parsed = sharpenRequestSchema.safeParse(await request.json());
if (!parsed.success) {
  return NextResponse.json({ error: "A hunch can't be empty." }, { status: 400 });
}
// ...
const priors = await recallPriors(session.user.id, parsed.data.rawText);
const sharpened = await sharpenHunch(parsed.data.rawText, priors, parsed.data.answers);
```

Leave the `hunchInputSchema` import if still used elsewhere in the file; otherwise remove it to avoid an unused import.

- [ ] **Step 6: Send `answers` from the create hook**

In `src/hooks/use-create-hunch.ts`, change `postHunch` and the mutation to accept answers:

```ts
import type { ClarifyingAnswer } from "@/lib/schemas/clarify";

async function postHunch(input: { rawText: string; answers: ClarifyingAnswer[] }): Promise<HunchWithHypothesis> {
  const res = await fetch("/api/hunch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.hunch) {
    throw new Error(body?.error ?? "Something went wrong sharpening your hunch.");
  }
  return { ...body.hunch, priors: body.priors ?? [] } as HunchWithHypothesis;
}

export function useCreateHunch() {
  return useMutation({ mutationFn: postHunch });
}
```

- [ ] **Step 7: Typecheck + commit**

Run: `npm run typecheck` → clean (note: `new-hunch-form.tsx` will now type-error on `createHunch.mutate(text)` until Task 6 — that is expected; if it blocks, do Task 6 before committing, or temporarily pass `{ rawText: text, answers: [] }`). To keep this task green, update the single existing call site in `new-hunch-form.tsx` minimally: `createHunch.mutate({ rawText: text, answers: [] })`.

```bash
git add src/mastra/agents/hypothesis-coach.ts src/mastra/agents/hypothesis-coach.test.ts src/app/api/hunch/route.ts src/hooks/use-create-hunch.ts src/components/hunch/new-hunch-form.tsx
git commit -m "feat(coach): thread clarifying answers into the hypothesis prompt"
```

---

### Task 5: Tailored protocol phases (name + action)

**Files:**
- Modify: `src/lib/schemas/protocol.ts` (add `name`, `action` to `protocolPhaseSchema`)
- Modify: `src/mastra/agents/protocol-designer.ts` (prompt + `composeInstructions` + fallback fills `name`/`action`)
- Modify: `src/components/protocol-track.tsx` (render `name`/`action`)
- Test: `src/lib/schemas/protocol.test.ts` (extend), `src/mastra/agents/protocol-designer.test.ts` (extend)

**Interfaces:**
- Consumes: `ProtocolDesign` (now with per-phase `name`/`action`).
- Produces: phases render a human name + action; fallback guarantees non-empty.

- [ ] **Step 1: Write the failing schema test**

Append to `src/lib/schemas/protocol.test.ts`:

```ts
import { protocolPhaseSchema } from "./protocol";

describe("protocolPhaseSchema name/action", () => {
  it("requires a non-empty name and action", () => {
    const ok = protocolPhaseSchema.safeParse({
      label: "B", kind: "intervention", days: 7,
      name: "No coffee after 2pm", action: "Skip all caffeine after 2pm; log your sleep score each morning.",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects a phase missing action", () => {
    const bad = protocolPhaseSchema.safeParse({ label: "A", kind: "baseline", days: 7, name: "Normal coffee" });
    expect(bad.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/schemas/protocol.test.ts`
Expected: FAIL — `name`/`action` not in schema.

- [ ] **Step 3: Extend the phase schema**

In `src/lib/schemas/protocol.ts`, `protocolPhaseSchema`:

```ts
export const protocolPhaseSchema = z.object({
  label: z.enum(["A", "B"]),
  kind: z.enum(["baseline", "intervention"]),
  days: z.number().int().positive(),
  /** Human name for the phase, e.g. "Normal coffee" / "No coffee after 2pm". */
  name: z.string().trim().min(1),
  /** What the user actually does this phase, in their own terms. */
  action: z.string().trim().min(1),
});
```

- [ ] **Step 4: Run to verify schema test passes**

Run: `npx vitest run src/lib/schemas/protocol.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing designer fallback test**

Append to `src/mastra/agents/protocol-designer.test.ts`:

```ts
import { fillPhaseDefaults } from "./protocol-designer";

describe("fillPhaseDefaults", () => {
  it("fills name/action when the model omits them", () => {
    const phases = fillPhaseDefaults(
      [{ label: "A", kind: "baseline", days: 7 }, { label: "B", kind: "intervention", days: 7 }],
      "sleep quality",
    );
    expect(phases[0].name.length).toBeGreaterThan(0);
    expect(phases[0].action.length).toBeGreaterThan(0);
    expect(phases[1].name.toLowerCase()).toContain("intervention");
  });

  it("keeps model-provided name/action", () => {
    const phases = fillPhaseDefaults(
      [{ label: "B", kind: "intervention", days: 7, name: "No coffee", action: "skip caffeine" }],
      "sleep",
    );
    expect(phases[0].name).toBe("No coffee");
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/mastra/agents/protocol-designer.test.ts`
Expected: FAIL — `fillPhaseDefaults` not exported.

- [ ] **Step 7: Add `fillPhaseDefaults`, extend `composeInstructions`, update prompt + parse**

In `src/mastra/agents/protocol-designer.ts`:

Add a phase-default filler and use it before parse. Add import of `ProtocolPhase`:

```ts
import {
  protocolDesignSchema,
  type Confounder,
  type PowerInfo,
  type ProtocolDesign,
  type ProtocolPhase,
} from "@/lib/schemas/protocol";

/**
 * Fill any missing per-phase name/action deterministically so the schema's
 * non-empty invariant holds even when the model omits them. Baseline phases
 * describe normal behaviour; intervention phases name the change.
 */
export function fillPhaseDefaults(
  phases: Array<Partial<ProtocolPhase> & Pick<ProtocolPhase, "label" | "kind" | "days">>,
  outcomeMetric: string,
): ProtocolPhase[] {
  return phases.map((p) => {
    const baseline = p.kind === "baseline";
    return {
      label: p.label,
      kind: p.kind,
      days: p.days,
      name: p.name?.trim() || (baseline ? "Baseline" : "Intervention"),
      action:
        p.action?.trim() ||
        (baseline
          ? `Keep your normal routine. Log your ${outcomeMetric} each day.`
          : `Apply the change you're testing. Log your ${outcomeMetric} each day.`),
    };
  });
}
```

Update `composeInstructions` to use the phase `name` in its lines:

```ts
export function composeInstructions(
  design: Pick<ProtocolDesign, "phases" | "washoutDays" | "controls">,
  outcomeMetric: string,
): string {
  const lines = design.phases.map((p, i) => {
    return `Phase ${i + 1} — ${p.name} (${p.days} days): ${p.action}`;
  });
  if (design.washoutDays > 0) {
    lines.push(
      `Leave a ${design.washoutDays}-day washout gap between phases so the previous phase stops affecting the next.`,
    );
  }
  if (design.controls.length) {
    lines.push("Keep these constant throughout:");
    lines.push(...design.controls.map((c) => `- ${c}`));
  }
  return lines.join("\n");
}
```

In `designProtocolShape`, run phases through `fillPhaseDefaults` before composing/parse:

```ts
const rawPhases = (raw.phases ?? []) as Array<
  Partial<ProtocolPhase> & Pick<ProtocolPhase, "label" | "kind" | "days">
>;
const phases = fillPhaseDefaults(rawPhases, input.outcomeMetric);

const instructions =
  typeof raw.instructions === "string" && raw.instructions.trim().length > 0
    ? raw.instructions
    : composeInstructions(
        { phases, washoutDays: raw.washoutDays ?? 0, controls: raw.controls ?? controls },
        input.outcomeMetric,
      );

return protocolDesignSchema.parse({ ...raw, phases, instructions });
```

Update the agent `instructions` prompt to add a phase-naming rule (append under the existing "phases:" rule):

```
- Each phase also needs a short human "name" and an "action". name: what the
  user calls this phase in plain words ("Normal coffee", "No coffee after 2pm").
  action: exactly what they do that phase and what to log, in their own terms.
  Baseline phases keep normal behaviour; the B phase names the specific change.
```

And add to the prompt string in `designProtocolShape` (before the final "Return ALL fields" line):

```
Name each phase in the user's own words (e.g. "Normal coffee" vs "No coffee after 2pm") and give a concrete action.
```

- [ ] **Step 8: Run designer tests**

Run: `npx vitest run src/mastra/agents/protocol-designer.test.ts`
Expected: PASS (fallback + fillPhaseDefaults tests).

- [ ] **Step 9: Render name/action in `protocol-track.tsx`**

Replace the phase `<li>` block so the name leads and the letter is a small tag, and show `action`:

```tsx
<li
  key={i}
  style={{
    flex: "1 1 140px",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "14px 12px",
    border: `1px solid ${intervention ? "var(--s1)" : "var(--rule)"}`,
    background: intervention ? "color-mix(in srgb,var(--paper) 82%,var(--s1))" : "transparent",
  }}
>
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11, fontWeight: 700, color: "var(--muted)", border: "1px solid var(--rule)", padding: "1px 6px" }}>
      {phase.label}
    </span>
    <span style={label}>{intervention ? "Intervention" : "Baseline"}</span>
  </div>
  <span style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: 16, lineHeight: 1.15, color: "var(--ink)", overflowWrap: "anywhere" }}>
    {phase.name}
  </span>
  <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--muted)", overflowWrap: "anywhere" }}>
    {phase.action}
  </span>
  <span style={{ fontFamily: "'Space Mono',monospace", fontSize: 11.5, color: "var(--muted)" }}>
    {phase.days} days
  </span>
</li>
```

Also change the `<ol>` to stack on narrow screens: `flexWrap: "wrap"` already set — keep, and each `<li>` `minWidth: 0` prevents overflow.

- [ ] **Step 10: Typecheck + commit**

Run: `npm run typecheck` → clean. Also `npx prisma generate` is NOT needed (Prisma `design` column is JSON — no migration).

```bash
git add src/lib/schemas/protocol.ts src/lib/schemas/protocol.test.ts src/mastra/agents/protocol-designer.ts src/mastra/agents/protocol-designer.test.ts src/components/protocol-track.tsx
git commit -m "feat(protocol): named, tailored phases (name + action)"
```

---

### Task 6: Conversational sharpen page

**Files:**
- Modify: `src/components/hunch/new-hunch-form.tsx` (full rework to a state machine with chip Q&A)

**Interfaces:**
- Consumes: `useClarify` (Task 3), `useCreateHunch` (Task 4, now `{ rawText, answers }`), `ClarifyingQuestion`, `ClarifyingAnswer`.
- Produces: `idle → asking → answering → committing → done` flow; lean done card.

- [ ] **Step 1: Add a chip-group subcomponent + answer state**

At the top of `new-hunch-form.tsx` add a `QuestionCard` that renders one question as tappable chips plus an optional "other" input, and calls back the chosen answer string.

```tsx
function QuestionCard({
  question,
  value,
  onChange,
}: {
  question: import("@/lib/schemas/clarify").ClarifyingQuestion;
  value: string;
  onChange: (answer: string) => void;
}) {
  const [other, setOther] = useState("");
  const isOther = value !== "" && !question.options.includes(value);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ ...label, color: "var(--ink)", textTransform: "none", letterSpacing: "0.01em", fontSize: 14.5 }}>
        {question.prompt}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {question.options.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              style={{
                padding: "8px 14px",
                border: `1px solid ${active ? "var(--s1)" : "var(--rule)"}`,
                background: active ? "color-mix(in srgb,var(--paper) 80%,var(--s1))" : "transparent",
                color: "var(--ink)",
                fontFamily: "'Space Mono',monospace",
                fontSize: 12.5,
                cursor: "pointer",
                overflowWrap: "anywhere",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {question.allowOther && (
        <input
          value={isOther ? value : other}
          onChange={(e) => { setOther(e.target.value); onChange(e.target.value); }}
          placeholder="something else…"
          style={{ width: "100%", padding: "10px 12px", background: "color-mix(in srgb,var(--paper) 82%,var(--ink))", border: `1px solid ${isOther ? "var(--s1)" : "var(--rule)"}`, color: "var(--ink)", fontFamily: "'Space Mono',monospace", fontSize: 13, outline: "none" }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rework the `NewHunchForm` state machine**

Replace the `NewHunchForm` function so it drives clarify → answer → commit. Keep the existing `Result` component and `appThemeStyle` wrapper. Full function:

```tsx
export function NewHunchForm({ seed }: { seed: string }) {
  const [rawText, setRawText] = useState(seed);
  const [questions, setQuestions] = useState<import("@/lib/schemas/clarify").ClarifyingQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const clarify = useClarify();
  const createHunch = useCreateHunch();

  const step: "idle" | "asking" | "answering" | "committing" | "done" =
    createHunch.data ? "done"
    : createHunch.isPending ? "committing"
    : questions ? "answering"
    : clarify.isPending ? "asking"
    : "idle";

  function startClarify(e: React.FormEvent) {
    e.preventDefault();
    const text = rawText.trim();
    if (!text || clarify.isPending) return;
    clarify.mutate(text, {
      onSuccess: (qs) => setQuestions(qs),
      // Degrade: if the clarifier fails, skip straight to a one-shot sharpen.
      onError: () => createHunch.mutate({ rawText: text, answers: [] }),
    });
  }

  function commit() {
    if (!questions) return;
    const payload: ClarifyingAnswer[] = questions
      .filter((q) => (answers[q.id] ?? "").trim() !== "")
      .map((q) => ({ id: q.id, prompt: q.prompt, answer: answers[q.id].trim() }));
    createHunch.mutate({ rawText: rawText.trim(), answers: payload });
  }

  function reset() {
    createHunch.reset();
    clarify.reset();
    setQuestions(null);
    setAnswers({});
    setRawText("");
  }

  const allAnswered = questions?.every((q) => (answers[q.id] ?? "").trim() !== "") ?? false;

  return (
    <main style={{ minHeight: "100dvh", ...appThemeStyle() }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(20px,6vh,56px) 20px 96px" }}>
        <Link href="/home" style={{ ...label, textDecoration: "none" }}>← home</Link>

        {step === "idle" || step === "asking" ? (
          <div style={{ marginTop: 40, opacity: step === "asking" ? 0.4 : 1, transition: "opacity 300ms ease", pointerEvents: step === "asking" ? "none" : "auto" }}>
            <h1 style={{ margin: 0, fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(30px,4.4vw,48px)", letterSpacing: "-0.02em", color: "var(--ink)" }}>
              What&apos;s nagging you?
            </h1>
            <p style={{ margin: "14px 0 0", fontSize: 14.5, lineHeight: 1.7, color: "var(--muted)" }}>
              Drop a gut feeling about your life. The coach asks a couple of quick questions, then sharpens it.
            </p>
            <form onSubmit={startClarify} style={{ marginTop: 26 }}>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={3}
                autoFocus
                disabled={step === "asking"}
                placeholder="coffee after lunch wrecks my sleep…"
                style={{ width: "100%", resize: "none", padding: "14px 16px", background: "color-mix(in srgb,var(--paper) 82%,var(--ink))", border: "1px solid var(--rule)", color: "var(--ink)", fontFamily: "inherit", fontSize: 15, lineHeight: 1.5, outline: "none" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--s1)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--rule)")}
              />
              <button type="submit" disabled={step === "asking" || !rawText.trim()} style={primaryBtn(!!rawText.trim())}>
                {step === "asking" ? "Thinking…" : "Sharpen it"}
              </button>
            </form>
          </div>
        ) : null}

        {step === "answering" && questions && (
          <div style={{ marginTop: 40, display: "grid", gap: 22 }}>
            <p style={{ margin: 0, fontStyle: "italic", fontSize: 13, color: "var(--muted)", overflowWrap: "anywhere" }}>&ldquo;{rawText}&rdquo;</p>
            <h1 style={{ margin: 0, fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(24px,3.4vw,34px)", letterSpacing: "-0.02em", color: "var(--ink)" }}>
              A couple of quick things
            </h1>
            {questions.map((q) => (
              <QuestionCard key={q.id} question={q} value={answers[q.id] ?? ""} onChange={(a) => setAnswers((prev) => ({ ...prev, [q.id]: a }))} />
            ))}
            <div>
              <button type="button" onClick={commit} disabled={!allAnswered} style={primaryBtn(allAnswered)}>
                Lock it in
              </button>
            </div>
          </div>
        )}

        {step === "committing" && (
          <div style={{ marginTop: 44, textAlign: "center" }}>
            <div style={{ width: 200, height: 200, margin: "0 auto" }} aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/starburst.png" alt="" aria-hidden style={{ width: "60%", height: "60%", objectFit: "contain", opacity: 0.45, margin: "20% auto", display: "block" }} />
            </div>
            <p aria-live="polite" style={{ marginTop: 4, fontFamily: "'Space Mono',monospace", fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" }}>
              Sharpening…
            </p>
          </div>
        )}

        {step === "done" && createHunch.data && <LeanResult hunch={createHunch.data} onReset={reset} />}

        {(clarify.isError && step === "idle") || createHunch.isError ? (
          <p role="alert" style={{ marginTop: 20, fontSize: 13, color: "var(--s1)" }}>
            {createHunch.error?.message ?? clarify.error?.message}
          </p>
        ) : null}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Add the `primaryBtn` helper + lean `LeanResult`**

Add near the top-level helpers:

```tsx
function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    marginTop: 14,
    padding: "14px 26px",
    border: "1px solid var(--ink)",
    background: enabled ? "var(--ink)" : "transparent",
    color: enabled ? "var(--paper)" : "var(--muted)",
    cursor: enabled ? "pointer" : "not-allowed",
    fontFamily: "'Space Mono',monospace",
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  };
}
```

Add a lean done card (replaces the heavy `Result` for the done state — keep the old `Result`/`Field`/`Pill` if referenced elsewhere, otherwise delete them to avoid dead code):

```tsx
function LeanResult({ hunch, onReset }: { hunch: HunchWithHypothesis; onReset: () => void }) {
  const h = hunch.hypothesis;
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ background: "color-mix(in srgb,var(--paper) 90%,var(--ink))", border: "1px solid var(--rule)", padding: "clamp(20px,2.4vw,28px)" }}>
        <div style={{ ...label }}>Your hypothesis</div>
        <h2 style={{ margin: "10px 0 0", fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: "clamp(19px,2.4vw,26px)", lineHeight: 1.25, letterSpacing: "-0.01em", color: "var(--ink)", overflowWrap: "anywhere" }}>
          {h.statement}
        </h2>
        <p style={{ margin: "12px 0 0", fontSize: 13.5, color: "var(--muted)", overflowWrap: "anywhere" }}>
          Measured by {h.outcomeMetric}
        </p>
      </div>
      <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <Link href={`/hunch/${hunch.id}/protocol`} style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "14px 24px", border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--paper)", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", textDecoration: "none" }}>
          Continue →
        </Link>
        <button type="button" onClick={onReset} style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Space Mono',monospace", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}>
          start over
        </button>
      </div>
    </div>
  );
}
```

Add the imports at the top:

```tsx
import { useClarify } from "@/hooks/use-clarify";
import type { ClarifyingAnswer } from "@/lib/schemas/clarify";
```

Remove the now-unused `ConfirmBot` import only if the done state no longer renders it (it doesn't here). Keep `useCreateHunch`, `HunchWithHypothesis`, `appThemeStyle`, `Link`, `useState`.

- [ ] **Step 4: Typecheck + manual smoke**

Run: `npm run typecheck` → clean.
Smoke (dev server running): visit `/hunch/new`, type a hunch → questions render as chips → answer → "Lock it in" → lean hypothesis card → "Continue →".

- [ ] **Step 5: Commit**

```bash
git add src/components/hunch/new-hunch-form.tsx
git commit -m "feat(sharpen): conversational coach with tappable questions + lean result"
```

---

### Task 7: Protocol page auto-designs on mount

**Files:**
- Modify: `src/app/hunch/[id]/protocol/page.tsx`

**Interfaces:**
- Consumes: `useDesignProtocol` (existing).
- Produces: protocol auto-designs once on mount; "Design my protocol" button becomes a "Redesign" retry only.

- [ ] **Step 1: Auto-fire the mutation once on mount**

In `protocol/page.tsx`, add a ref-guarded effect. Add imports:

```tsx
import { useEffect, useRef } from "react";
```

Inside the component, after `const design = useDesignProtocol(id);`:

```tsx
const fired = useRef(false);
useEffect(() => {
  if (fired.current) return;
  fired.current = true;
  design.mutate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

- [ ] **Step 2: Rework the header + button for the auto-design flow**

The primary CTA is no longer "Design my protocol" (it runs itself). Replace the button block so it shows a loader while pending and a subtle "Redesign" only after a result exists:

```tsx
{design.isPending && (
  <p aria-live="polite" style={{ marginTop: 26, fontFamily: "'Space Mono',monospace", fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" }}>
    Designing your experiment…
  </p>
)}

{data && !design.isPending && (
  <button
    type="button"
    onClick={() => design.mutate()}
    style={{ marginTop: 22, background: "none", border: "none", cursor: "pointer", fontFamily: "'Space Mono',monospace", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}
  >
    ↻ redesign
  </button>
)}
```

Remove the old `idle`-based "Design my protocol" button and the now-unused `idle` variable. Keep the error block, the `ProtocolTrack` + "Start experiment →" block, and the refusal panel.

- [ ] **Step 3: Typecheck + smoke**

Run: `npm run typecheck` → clean.
Smoke: from the sharpen "Continue →", the protocol page shows "Designing…" then the tailored plan then "Start experiment →" — no button press needed.

- [ ] **Step 4: Commit**

```bash
git add src/app/hunch/[id]/protocol/page.tsx
git commit -m "feat(protocol): auto-design on mount, redesign as retry"
```

---

### Task 8: Overflow + smoothness audit

**Files:**
- Modify: `src/components/protocol-track.tsx`, `src/components/checkin-tap.tsx`, `src/components/verdict.tsx`, `src/components/belief-meter.tsx`, `src/app/hunch/[id]/page.tsx`, `src/app/hunch/[id]/protocol/page.tsx`

**Interfaces:** none new — hardening only.

- [ ] **Step 1: Add overflow guards to every card + long-text node**

For each `<section>`/card container add `minWidth: 0` and `maxWidth: "100%"`. For every user-text node (instructions, controls, narrative, statement, phase name/action) add `overflowWrap: "anywhere"`. The instructions paragraph in `protocol-track.tsx` already has `whiteSpace: "pre-line"` — add `overflowWrap: "anywhere"` alongside it.

Concretely, in `protocol-track.tsx` instructions paragraph:

```tsx
<p style={{ margin: "18px 0 0", fontSize: 14, lineHeight: 1.7, color: "var(--ink)", whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
  {design.instructions}
</p>
```

And the confounder `<li>` text span already wraps; add `overflowWrap: "anywhere"` to its inner `<span>`.

- [ ] **Step 2: Make the phase track scroll rather than burst on very narrow screens**

Wrap the `<ol>` in `protocol-track.tsx` so it never forces horizontal page scroll: keep `flexWrap: "wrap"` (already set). Confirm each `<li>` has `minWidth: 0` (set in Task 5). No `overflow-x` needed once items wrap. Add `maxWidth: "100%"` to the `<section>`.

- [ ] **Step 3: Add state transitions on the dashboard**

In `src/app/hunch/[id]/page.tsx`, wrap the `content()` container with a fade so loading→loaded isn't a hard pop:

```tsx
<div style={{ marginTop: 26, transition: "opacity 300ms ease", opacity: query.isPending ? 0.5 : 1 }}>{content()}</div>
```

- [ ] **Step 4: Verify no horizontal overflow (manual)**

Smoke at a narrow viewport (~360px, devtools): `/hunch/new` (answering step), `/hunch/[id]/protocol` (tailored plan), `/hunch/[id]` (dashboard). No element bursts the body; long text wraps; page never scrolls sideways.

- [ ] **Step 5: Full test + typecheck + commit**

Run: `npm run typecheck` → clean. Run: `npx vitest run` → all unit tests pass.

```bash
git add -A
git commit -m "fix(ui): overflow guards + state-transition smoothing across the flow"
```

---

## Self-Review

**Spec coverage:**
- Conversational coach (Q&A) → Tasks 1, 2, 3, 4, 6. ✓
- AI-generated tappable questions → Task 2 (agent) + Task 6 (chip UI). ✓
- Two agents (clarifier + coach) → Tasks 2, 4. ✓
- Approach 2 (protocol own page, auto-design) → Task 7. ✓
- Lean sharpen result (kills info dump) → Task 6 `LeanResult`. ✓
- Tailored plans (name/action per phase) → Task 5. ✓
- Overflow + theme + smoothness → Tasks 5, 6, 7, 8. ✓
- Error handling (clarifier fail → one-shot sharpen; empty answers tolerated; fallback fills name/action; idempotent auto-design) → Tasks 4 (default []), 5 (fillPhaseDefaults), 6 (onError degrade), 7 (ref guard). ✓
- Testing (clarifier eval, sharpen unit, compose/fill unit, route tests) → Tasks 2, 3, 4, 5. ✓

**Type consistency:** `sharpenHunch(rawText, priors, answers)`, `askClarifying(rawText, priors)`, `useCreateHunch` payload `{ rawText, answers }`, `ClarifyingAnswer { id, prompt, answer }`, `ProtocolPhase { …, name, action }`, `fillPhaseDefaults`, `composeInstructions`, `buildSharpenPrompt` — names consistent across tasks. ✓

**Placeholder scan:** no TBD/TODO; every code step carries real code. ✓
