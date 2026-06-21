# Hunch — R&D

> *"Got a hunch? Test it."*
> A personal-science copilot that turns a vague self-belief into a real n-of-1 experiment, then tells you what **your own data** actually says — with honest, calibrated confidence.

Status: R&D / pre-build · Owner: Gayatri · Last updated: 2026-06-09

---

## 1. The problem

People constantly form hunches about their own bodies and habits:

- *"Creatine makes my afternoon crash worse."*
- *"I sleep better when I stop screens an hour before bed."*
- *"Magnesium actually does nothing for me."*

Today they resolve these the worst possible way: they read a blog, try a thing for a few days, *feel* like it worked (or didn't), and update their behavior on noise. The failures are specific:

1. **No falsifiability.** The hunch is never stated as something that could be proven wrong.
2. **No design.** No baseline, no washout, no randomization — so placebo, expectation, and confounders dominate.
3. **No honest readout.** "I think it helped" is not a confidence level. People are wildly overconfident from tiny samples.
4. **No memory.** Every experiment starts from zero; nothing compounds into a model of *this specific person*.

Existing quantified-self tools (Oura, Whoop, Apple Health, Bearable, etc.) are **dashboards** — they show you charts and leave the inference to you. None of them *design the experiment* or *do the causal reasoning*.

## 2. Who it's for

- Quantified-self / biohacker crowd who already track sleep, HRV, supplements.
- Engineers/scientists who want rigor applied to their own life.
- People with a specific recurring symptom (afternoon crash, poor sleep, brain fog) chasing a cause.

Not a medical device. Not a diagnosis tool. Explicitly a *personal experimentation* tool with a hard safety boundary (see §7).

## 3. Competitive landscape (why this isn't already done)

| Player | What it does | Gap Hunch fills |
|---|---|---|
| Oura / Whoop / Apple Health | Track + dashboard | No experiment design, no causal inference, no abstention |
| Bearable, Exist.io | Symptom/mood logging + correlations | Correlation ≠ causation; no protocol design, no Bayesian belief |
| StudyMe / StudyU (academic) | n-of-1 trial templates | Research-grade but rigid, no agentic design, abandoned-ish |
| Memento Labs (2019) | Self-experiment app | Stalled / dead |
| Generic "ask AI about my Oura data" GPTs | Chat over health data | Thin wrapper; no design, no stats engine, no calibration, no memory |

**Conclusion from prior scans:** the agentic *design + run + infer* loop for personal experiments is genuinely under-built. The white space is real.

## 4. The product concept

The core loop:

```
1. Drop a hunch      "Creatine makes my afternoon crash worse"
2. Sharpen it         → falsifiable hypothesis + measurable outcome + named confounders
3. Design a trial     → ABA / randomized n-of-1: phase lengths, washout, power
4. Safety gate        → risky? flag/refuse. safe? approved to run.
5. Run it             → low-friction one-tap daily check-ins
6. Watch belief move  → Bayesian credible interval narrows live as data lands   ← signature
7. Verdict            → plain-English call + calibrated confidence + effect size
8. Memory             → result becomes a prior in your personal causal graph
```

### Signature UI moment
A **living belief meter**: a Bayesian credible interval that visibly narrows and shifts as each day's data arrives. Dashboards show a flat chart *after* the fact — Hunch shows your *certainty sharpening in real time*. "Watch your belief sharpen" is the demo.

Supporting UI:
- **Hunch Cards** — each experiment is a card that flips: front = the hypothesis as a bet, back = the verdict + belief bar.
- **Phase track** — ABA phases as a timeline with a now-marker.
- **One-tap check-ins** — adherence dies if logging is a chore. Swipe/tap, never a form. (Hard design constraint, not polish.)
- Aesthetic: modern lab-notebook × Linear/Arc — fast, tactile, motion-driven.

## 5. AI architecture (Mastra) — the depth that makes it not a wrapper

**Agents**

| Agent | Job |
|---|---|
| Hypothesis Coach | vague hunch → falsifiable, measurable hypothesis; names outcome metric + confounders |
| Protocol Designer | ABA / randomized n-of-1 design: phase length, washout, power |
| Safety Reviewer | gates risky protocols (supplements, fasting, meds); can refuse — **eval-gated** |
| Adherence Companion | daily check-ins, smart nudges, data capture |
| Analyst | runs the stats, writes the verdict with calibrated confidence |

**Workflows**
- *Design*: hunch → hypothesis → protocol → safety gate → approved
- *Analysis*: data → stats tool → Bayesian update → narrative verdict

**Tools (deterministic — real computation, the LLM never does the math)**
- Bayesian updating engine
- Power / sample-size analysis
- Confounder detection
- CSV / Apple Health data ingest

**Evals (the trust layer — they *gate* what agents may auto-do)**
- **Calibration** (Brier score): does stated confidence match outcomes?
- **Safety**: does the Safety Reviewer catch dangerous designs before auto-approval?
- **Hypothesis quality**: is the sharpened hypothesis actually falsifiable + measurable?

**Memory** — per-user **causal graph**: confirmed findings become priors for the next hunch ("you already learned caffeine after 2pm wrecks your deep sleep").

## 6. Statistics approach (decision: TypeScript conjugate Bayesian)

n-of-1 trials produce **small data** (weeks of daily points). Conjugate Bayesian models fit this regime exactly:

- **Beta-Binomial** for binary outcomes ("did I crash today? y/n")
- **Normal-Normal** for continuous outcomes ("hours of deep sleep")

Why TS conjugate over a PyMC sidecar:
- Closed-form updates are **instant + incremental** → smooth live belief-meter animation. MCMC on every check-in would be slow/janky.
- One runtime, one deploy, one language → ships on a personal-project budget.
- Cleaner to fully understand and defend than a PyMC black box.

Built behind a `BayesianModel` interface so a PyMC/Stan sidecar can be dropped in later for hierarchical modeling **if** a future experiment needs it. v1 does not.

## 7. Safety boundary (non-negotiable)

- Not medical advice; explicit disclaimers.
- Safety Reviewer **refuses** designs involving prescription meds, dangerous fasting, anything contraindicated; routes to "talk to a doctor."
- Safety eval is a *gate*: if it regresses, auto-approval is disabled and everything routes to manual confirm.
- No PII beyond what the user enters; health data encrypted at rest.

## 8. Tech stack (final)

- **Frontend:** Next.js (App Router) + TypeScript · Tailwind + shadcn/ui · Framer Motion + visx (belief distribution) · TanStack Query
- **AI:** Mastra · Anthropic Claude (Opus/Sonnet)
- **Stats:** TypeScript conjugate Bayesian engine behind a swappable interface
- **Backend/Data:** Mastra server + Drizzle ORM · Postgres + TimescaleDB (check-ins) + pgvector (past-experiment recall) · CSV / Apple Health importer
- **Auth:** Auth.js
- **Deploy:** Vercel (web) + Fly/Railway (Mastra + Postgres)

## 9. MVP scope (practical — personal project)

**In:**
- Drop a hunch → Hypothesis Coach sharpens → Hunch Card
- Protocol Designer produces an ABA design + Safety gate
- One-tap daily check-ins (manual) + CSV/Apple Health import
- TS Bayesian engine + live belief meter
- Analyst verdict with calibrated confidence
- Calibration + Safety + Hypothesis-quality evals
- Causal-graph memory (read priors into new hunches)

**Out (later):**
- Live wearable OAuth/webhooks (Oura/Whoop)
- Hierarchical / PyMC modeling
- Social / sharing
- Mobile-native app

## 10. Risks & open questions

| Risk | Mitigation |
|---|---|
| Adherence drop-off kills experiments | One-tap check-ins, nudges, short trial defaults |
| Users over-read weak results | Calibrated confidence + honest abstention is the product, not a feature |
| Safety / liability | Hard refusal boundary + disclaimers + eval gating |
| Scope creep on a personal build | Strict MVP §9; integrations are explicitly out |

**Open questions:**
- Default trial length / minimum data before a verdict is offered?
- How to present "inconclusive" so it feels like a *result*, not a failure?
- Confounder handling at v1 — surface-and-warn vs. attempt-to-adjust?

## 11. Next step

Write `PLAN.md` — data model, per-agent specs (system prompts + I/O schemas), workflow diagrams, eval definitions, and the first vertical slice (drop hunch → sharpen → render card).
