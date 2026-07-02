# Phase 6 — Causal-graph memory (Design Spec)

> Status: draft 2026-07-02. Expands the Phase 6 milestone in `PLAN.md`.
> Binding constraints: `RULES.md` (esp. §1 no fresh deps, §3 no LLM arithmetic, §7 scope).
> Product source of truth: `RESEARCH.md` (§4 core loop step 8, §5 memory, §10 open questions).
> Builds on Phase 5 (`docs/superpowers/specs/2026-07-01-phase5-analyst-verdict-calibration-design.md`)
> and Phase 2 (Hypothesis Coach + hunch creation).

## Goal

Confirmed findings compound into a per-user **causal graph** so a new hunch
related to something already learned surfaces that prior — *"you already found
caffeine after 2pm cuts your sleep."* Memory is the fourth gap `RESEARCH §1`
names (every experiment starts from zero). This phase closes the core loop:
a concluded trial's verdict becomes a `CausalEdge`; creating a new hunch recalls
the relevant edges and shows them on the Hunch Card.

## Resolved decisions

1. **Surface-only priors — the Bayesian engine math is untouched.** Recalled
   findings are shown to the user and fed to the Hypothesis Coach as context, but
   they do NOT seed the Beta-Binomial / Normal-Normal priors. This keeps the
   Phase 4/5 calibration guarantees (the deterministic Brier gate assumes a flat
   prior) intact. Engine-seeding is a later phase. Matches the exit criterion
   ("surfaces that prior"), which surfacing alone satisfies.

2. **Recall = deterministic pre-filter → LLM relevance (no new dependency).** A
   pure keyword/entity-overlap pre-filter narrows a user's stored edges to
   candidates; the LLM (a dedicated `memory` agent) then picks the genuinely
   related ones and phrases a one-line note. No pgvector, no embedding
   dependency — consistent with every prior phase (`RULES §1`). The deterministic
   layer is cheap and unit-testable; the LLM covers synonyms/phrasing the overlap
   filter misses ("coffee" vs "caffeine").

3. **Edges are written on conclusion, atomically, for three categories.** When a
   verdict is generated (Phase 5), the same `$transaction` that creates the
   `Verdict` and flips `status="concluded"` also creates a `CausalEdge`:
   - `helped` → `direction = "increases"`
   - `hurt` → `direction = "decreases"`
   - `inconclusive_no_effect` → `direction = "none"` (a real negative finding —
     stops the user re-running a dead-end experiment)
   - `inconclusive_insufficient` → **no edge** (not enough data to be a finding)

4. **Edge fields derive from data already stored — no extra LLM call at write
   time.** `cause` = the sharpened `hypothesis.statement`, `effect` =
   `hypothesis.outcomeMetric`, `direction` per the category, `effectSize` =
   `belief.effect`, `confidence` = `belief.pEffect`, `sourceHunchId` = the hunch.
   No LLM produces a stored value (`RULES §3`).

5. **Recall is additive and never blocks hunch creation.** No edges, no
   candidates, or a memory-agent failure all degrade to an empty prior list;
   sharpening proceeds unchanged. A user's first-ever hunch is never delayed.

## Architecture / data flow

```
WRITE (extends the Phase 5 verdict route transaction)
  verdict generated →
    $transaction([
      verdict.create(...),
      hunch.update({ status: "concluded" }),
      ...(edgeInput ? [causalEdge.create(edgeInput)] : []),   // Phase 6
    ])
  where edgeInput = writeEdgeData(verdict, hypothesis, hunchId, userId)
  returns null for inconclusive_insufficient (no edge).

RECALL (extends POST /api/hunch — hunch creation / sharpening)
  POST /api/hunch { rawText } →
    priors    = await recallPriors(userId, rawText)      // [] on any failure
    hypothesis = await sharpenHunch(rawText, priors)     // priors as prompt context
    persist hunch + hypothesis (hypothesis nested via include)
    return { hunch, priors }                             // card renders priors

  recallPriors(userId, rawText):
    edges      = readEdges(userId)                        // pure DB read
    candidates = selectCandidatePriors(edges, rawText)    // pure overlap pre-filter, top-N
    if candidates.length === 0 → return []
    relevant   = memory agent picks related + note        // LLM at the leaf
    return relevant Prior[]
```

The number/decision path (which categories write, the direction mapping, the
overlap pre-filter) is deterministic and unit-tested; the LLM sits only at the
recall-relevance leaf and touches only language.

## Components (units, each independently testable)

- **`src/lib/schemas/prior.ts`** — zod. `priorSchema` (the recalled finding DTO:
  `cause`, `effect`, `direction` enum `increases|decreases|none`, `effectSize`,
  `confidence`, `sourceHunchId`) + type `Prior`; `recallResultSchema` (the memory
  agent's structured output: `relatedSourceHunchIds: string[]`, `note: string`).
- **`src/lib/memory/causal-graph.ts`** — persistence seam.
  `writeEdgeData(verdict, hypothesis, hunchId, userId): CausalEdgeCreateInput | null`
  (pure mapping; null for `inconclusive_insufficient`) and
  `readEdges(userId): Promise<CausalEdge[]>` (thin DB read). The mapping is
  unit-tested against the category→direction table and the write-rule.
- **`src/lib/memory/priors.ts`** — `selectCandidatePriors(edges, rawText, limit):
  CausalEdge[]`. Pure: lowercase-tokenize `rawText` and each edge's `cause`+`effect`,
  strip stop-words, score by token overlap, return the top-`limit` above a floor.
  No LLM, no DB. Unit-tested (overlap, ranking, limit, empty, stop-words).
- **`src/mastra/agents/memory.ts`** — `memory` agent + `recallRelevantPriors(rawText,
  candidates): Promise<RecallResult>`. System prompt: pick from the CANDIDATE
  findings only the ones genuinely relevant to the new hunch; never invent a
  finding; write one short, plain-English note. Structured output only. No unit
  test (LLM-only, eval-gated).
- **`src/lib/memory/recall.ts`** — `recallPriors(userId, rawText): Promise<Prior[]>`
  orchestration: `readEdges` → `selectCandidatePriors` → `recallRelevantPriors` →
  map to `Prior[]`. Try/catch → `[]` on any failure (recall never blocks creation).
- **Modified: `src/app/api/hunch/[id]/verdict/route.ts`** — add the conditional
  `causalEdge.create` to the existing transaction.
- **Modified: `src/app/api/hunch/route.ts`** (POST create) — call `recallPriors`,
  pass priors to `sharpenHunch`, add `priors` to the existing `{ hunch }` response.
- **Modified: `src/mastra/agents/hypothesis-coach.ts`** — `sharpenHunch(rawText,
  priors?)` gains an optional priors context arg. Prompt-only enrichment; the
  `sharpenedHypothesisSchema` output is unchanged (backward compatible).
- **Modified: Hunch Card (`src/components/hunch-card.tsx`)** — render recalled
  priors ("You already learned…") when present; nothing when the list is empty.
- **Modified: `src/mastra/index.ts`** — register the `memory` agent (+ index test).

## Evals

- **`src/mastra/agents/memory.eval.test.ts` — LLM, key-gated (Phase 3/5 style).**
  Given a stored caffeine→sleep finding as a candidate and a caffeine-related
  hunch, the agent selects it; given an unrelated hunch (e.g. standing desk), it
  selects nothing; it never returns a `sourceHunchId` that was not in the
  candidates. Runs under `test:eval` with `OPENROUTER_API_KEY`, self-skips
  otherwise.

The deterministic pre-filter is gated by ordinary unit tests; the relevance
judgment by the key-gated faithfulness eval — the same labor split as Phase 5.

## Edge cases

- **Empty graph / no candidates** → `recallPriors` returns `[]`; creation unchanged.
- **Memory-agent failure** (API down, bad structured output) → caught, `[]`
  returned; sharpening still succeeds. Recall is additive, never fatal.
- **Self-reference** — `readEdges` (and recall) exclude the current hunch's own
  `sourceHunchId`; guarded even though it can't arise at create time.
- **Duplicate re-runs** — the same intervention concluded twice writes two edges;
  v1 keeps both (recency surfaces the latest). Dedup/merge is out of scope.
- **Invented finding** — the agent's output is filtered to `sourceHunchId`s that
  were actually in the candidate set before mapping to `Prior[]`; a hallucinated
  id is dropped defensively (not just trusted from the eval).

## Known simplifications (v1)

- **Surface-only** — priors inform the user and the coach's prose, not the engine
  math.
- **Lexical pre-filter** — overlap is token-based; the LLM covers synonyms, but a
  finding sharing no surface tokens and never reaching the candidate set is missed.
  `limit` is generous to compensate.
- **No dedup, no graph UI** — the card lists recalled findings as text.

## Out of scope (Phase 7+)

- pgvector semantic recall; embedding dependencies.
- Engine-seeding: turning a `CausalEdge` into an informative Bayesian prior.
- Edge dedup/merge; causal-graph visualization; cross-user priors.
- Live wearable data. No new npm dependencies.

## Exit criteria

- Concluding a trial writes a `CausalEdge` atomically (helped/hurt/no_effect;
  none for insufficient).
- Creating a hunch related to a prior finding surfaces it on the Hunch Card;
  an unrelated hunch surfaces nothing.
- Recall never blocks or breaks hunch creation.
- The memory faithfulness eval passes under `test:eval`.
- All standard gates green (typecheck, lint, unit tests, build).
