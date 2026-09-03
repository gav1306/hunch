# Parameters and safety — design

**Date:** 2026-09-02
**Status:** spec, not yet planned or built
**Supersedes parts of:** `2026-07-30-multi-parameter-logging-design.md` (the `binary | continuous` type system)

---

## Why now

Two complaints, one root cause.

1. **The app asks for numbers people cannot produce.** Sleep in hours is fine — a phone tells you. Blood pressure is not: almost nobody owns a cuff, and the ones who do are people already managing a condition. A trial that asks for a number the user cannot get is a trial that dies on day three with a column of blanks.
2. **The check-in control is a bare number input.** It is the screen the user sees every single day for three weeks, and it is a text box.

The root cause is the type system. `parameterTypeSchema = z.enum(["binary", "continuous"])` (`src/lib/schemas/parameter.ts:4`) has exactly one bucket for every number, so the app cannot tell apart *a count of bugs*, *a 1-10 mood rating*, and *a systolic reading off a cuff*. They are not the same thing: they need different controls, different validation, and — critically — different answers to "can this person actually produce this number?"

---

## What the spike showed

Three deliberately non-health hunches were run through the live Coach and the Protocol Designer on 2026-09-02 (Claude Sonnet 5 via OpenRouter). The point was to check whether the measurement problem is a health problem or a general one.

**It is general.** From "my houseplants droop when I play music in the room", the Coach proposed:

```
Room temperature   continuous  °F  50-90
Room humidity      continuous  %   0-100
Sunlight exposure  continuous  hours 0-12
```

Room humidity to one percent requires a hygrometer. This is the blood-pressure failure exactly, with no health content anywhere near it. **The device gate must be universal, not a branch inside a health check.**

Everything else the spike returned, and what it implies:

| Observation | Implication |
|---|---|
| Bug count, droopiness 1-10, dollars, hours, °F, % all came back as `continuous` | The four kinds below are not speculative — the model is already producing all four, and the schema is flattening them |
| The plant trial's outcome was itself a 1-10 rating | `scale` must be legal as the **primary**, not just as a tracker |
| Coach returned exactly **4 trackers on all 3 hunches** | The "propose none rather than padding" instruction is not working. "Hours spent coding", "Time spent shopping" are filler |
| Coach proposed hunger "1-10"; the Designer's phase text for the same trial said "1-5" | The two agents disagree about scale granularity **within one trial**. Nothing enforces consistency |
| "Total dollars spent **per shopping trip**", phases 7 days each | **Cadence bug.** The engine counts days; this outcome is per-event. Shopping twice a week yields 2 readings for a 7-day phase, and the analysis will not know the difference |
| Safety reviewer approved all 3, but volunteered "if you notice mood, energy, or health changes... consider checking in with a doctor" on the walking trial | The reviewer injects health framing into non-health trials |

The cadence bug and the padding are outside this spec's scope. They are logged at the end.

---

## 1. Four measurement kinds

Replace the two-value enum:

```ts
export const parameterKindSchema = z.enum(["binary", "scale", "count", "amount"]);
```

| Kind | Is | Control | Example from the spike |
|---|---|---|---|
| `binary` | yes / no | Two-state toggle | "Took morning walk" |
| `scale` | subjective rating, fixed points | Tap one of N | "Plant droopiness 1-10" |
| `count` | how many times | Stepper, −/+ | "Bugs found today" |
| `amount` | a measured quantity with a unit | Number + unit | "Sleep hours", "dollars" |

**The engine does not change.** `scale`, `count` and `amount` are all continuous to the Bayesian model. This is a change to how a value is *asked for and validated*, not how it is analysed. That containment is the point: `src/lib/belief.ts` and the analyst are untouched.

Migration: existing `continuous` rows become `amount` when they carry a `unit`, `scale` when `min`/`max` describe a rating range, `count` otherwise. `binary` is unchanged.

### Scale granularity

Fix it at **1-5**, and constrain the Coach to it. Reasons: five tap targets fit a phone row, and the spike proved the agents cannot agree on granularity when it is free (1-10 vs 1-5 in the same trial). A person's self-rating is not precise to ten points anyway.

---

## 2. The device gate — universal, not a health branch

**The rule: `amount` requires an instrument the user says they have.**

This sits here, beside the kinds, rather than inside the health section. The spike settled that: the parameter that failed hardest was *room humidity, to one percent*, in a hunch about houseplants. The gate is a property of the `amount` kind, and it fires wherever `amount` appears.

Before the Coach may propose an `amount` parameter, it must answer: *how would this person get this number?* If the answer is a device, the confirm gate asks the user whether they own it.

- **Yes** → the parameter stays as an `amount`.
- **No** → the Coach must offer a **perceivable proxy** — the same signal as the body or the eye reports it.

| Wanted | No instrument → proxy |
|---|---|
| Blood glucose (mg/dL) | "Energy after lunch", `scale` 1-5 |
| Room humidity (%) | "Air feels damp", `binary` |
| Blood pressure (mmHg) | "Headache or tightness today", `binary` |

A proxy is a weaker measurement, and the app should say so rather than pretend otherwise. But a weak reading every day beats a strong one the user never takes.

### The Clarifier is the reframe step

The Clarifier already runs before the Coach (`/api/hunch/clarify` → at most three tappable questions → answers feed the Coach). It needs no new screen, and there should not be one. It needs two questions added to its brief:

- **Subject.** "houseplants" is plural, and the Designer duly wrote *"rate each plant's droopiness"* — several subjects averaged into one number, which is undefined. One trial, one subject. *"Which plant?"*
- **Measurability.** Its current brief covers outcome, measurement and dose. It never asks **can you actually get this number every day.** That single question rescues the plant trial and the glucose trial alike.

When a parameter fails the gate, the confirm screen offers **at most two reframes plus "run it as is."** The escape hatch is never removed — the user overrules the app, not the reverse.

### Weirdness is never the trigger

Sorting hunches by "is this unusual" gets it backwards in both directions, and the spike proves it:

- *Shopping hungry* — odd framing, **perfectly measurable**. Dollars off a receipt. Runs clean.
- *Blood glucose* — an ordinary hunch, **unmeasurable** for almost everyone.

The only question that sorts these correctly is "can you produce this number daily?" Refusing unusual hunches would also kill the thing that makes the app worth opening.

### `subject: self | other`

Add to the hypothesis. **One consequence only:** a non-self result never becomes a `CausalEdge` prior recalled into the user's next hunch. Otherwise "you already learned music affects droopiness" surfaces inside a sleep experiment.

The trial still runs. Still gets a verdict. Still exports. It just does not enter the model of *you*.

### Expectancy bias — name it, don't fix it

The person rating droopiness knows which week the music is on. That is worse for an external subject, where the rating is the only measurement, but it exists in every self-experiment too — you know which week you skipped the walk. Not grounds for refusing. Grounds for the verdict saying so, instead of implying a precision the design cannot support.

---

## 3. Health, without practising medicine

The framing this app has to hold: **it records what happened, it does not explain why.** A verdict is "these two things moved together in your data", never "this caused that".

### Devices and conditions are different questions

- **Devices** decide what the user *can log*. A glucose monitor unlocks a glucose `amount`.
- **Conditions** can only *stop* a trial. A diagnosis is never used to explain a result, personalise a threshold, or adjust a verdict.

Conflating these turns a logging app into a diagnostic one. Keep them apart in the schema, not just in the copy.

### Blood pressure

Two parameters. **Systolic is primary; diastolic is a tracker.** One number drives the verdict — the Bayesian model takes a single outcome, and picking for the user is better than making them choose.

### Observe-only — a third outcome

Today `safetyState` is `approved | refused | pending`. Add **`observe-only`**.

A refusal is a dead end, and dead ends are why people leave. Observe-only keeps the trial alive with the intervention removed: **change nothing, log daily.** No phases, no A/B, no verdict — a diary with a chart.

It is the right answer whenever the *hunch* is reasonable but the *intervention* is not ours to schedule. A diagnosed user who wants to know whether their afternoon slump tracks their lunch gets to find out, without the app prescribing anything.

### Medication

**Standing rule: the app never schedules a change to prescribed medication.** No phase says "today, skip it". If a doctor changes a dose mid-trial, logging what follows is fine — the app just is not the thing that decided it.

Two layers of detection, because neither is enough alone:

1. **A deterministic phrase check at sharpen time** — *stop taking*, *skip my*, *off my*, *without my*, *half dose*, *every other day*. Pure code, unit-tested, no model call. Fires before the user has invested three minutes in a protocol.
2. **The Safety Reviewer's existing verdict** for the phrasings the list will miss.

Layer 1 catches phrasing, not intent. Someone determined can word around it. It is a guardrail, not a lock, and it should not be documented internally as if it were one.

**What the user sees**, at the point of typing:

> **Hunch can't plan a trial that changes your medication.**
>
> Starting, stopping or adjusting a prescribed drug is a decision for you and your doctor. It isn't something this app will schedule for you.
>
> **What it can do:** keep the record. Log how you feel each day while you take it exactly as prescribed — and if your doctor does change something, the log is already running and you'll have both sides of it.
>
> `[ Track it as it is ]` `[ Edit my hunch ]`

`Track it as it is` converts the hunch to observe-only in one tap, carrying the raw text and clarifying answers over. Nothing the user typed is thrown away.

The copy names the reason once and does not repeat it. No warning triangle, no paragraph on safety. The person asking this has usually noticed something real and wants to know if it is real — the message should not read as an accusation.

---

## 4. The mid-trial safety net

The gap: `routedToDoctor` exists (`src/lib/schemas/protocol.ts:82`) but is **design-time only**. Once a trial is running, a user can log a systolic of 210 for nine days and the app will cheerfully compute a verdict.

Three mechanisms. **All deterministic — no model call anywhere in this path.** An LLM deciding whether someone should see a doctor is the exact thing this app must not do.

1. **Typo guard.** Value is an order of magnitude off this parameter's own range → "Did you mean 120?" Catches the fat finger before it poisons the data.
2. **Personal outlier.** Value sits far outside *the user's own* distribution for that parameter. Says only "this is unusual for you" — a statement about their data, which is the only thing the app can honestly make.
3. **Published limits.** For `amount` parameters on BP and glucose only, hard thresholds from published guidance. Cites the source.

**What happens:** a banner offering **pause the trial** or **keep going**. Never automatic — the user decides.

**What must not happen:** the flag never reaches the Analyst, never enters a verdict, never becomes a `CausalEdge`. It is a nudge to a person, not an input to the math. If it leaked into the analysis, the app would be adjusting conclusions based on health status — practising medicine through a side channel.

---

## 5. Mid-run parameter edits

Today the protocol route 409s once `protocol.startedAt` is set (`src/app/api/hunch/[id]/protocol/route.ts`), because readings hang off parameters by id.

Relax it, narrowly:

- **Add a tracker** — allowed. New parameter, readings start from today, earlier days are legitimately null.
- **Retire a tracker** — allowed, *soft*. Sets `retiredAt`; the row and its history stay. Never a delete.
- **Change the primary** — **refused.** Changing what you are measuring mid-trial is what makes a result meaningless. This is the one that stays locked.

---

## 6. Check-in controls

Replace the number `Input` at `src/components/check-in.tsx:229`. One control per kind:

| Kind | Control | Registry |
|---|---|---|
| `binary` | Two-state toggle | `toggle-group` — **not yet installed** |
| `scale` | 5 tap targets | `toggle-group` |
| `count` | Stepper with −/+ | existing `Button` + `Input` |
| `amount` | Number + unit suffix | existing `Input` |

Only `toggle-group` needs pulling from the registry. Everything else composes from what Phase 04 already installed.

---

## 7. Verdict framing — direction, not valence

### The bug this started as

`effect = meanB - meanA` on the raw outcome (`src/lib/bayes/normal-normal.ts:37`, `beta-binomial.ts:32`), and `classifyVerdict` maps `low > 0 -> "helped"` (`src/lib/verdict.ts:24`). **Nothing in the codebase knows whether a higher number is better.**

Take the spike's first hunch: outcome "number of bugs found", intervention "skip the morning walk". If skipping raises the bug count, `effect > 0`, the category is `helped`, and `src/components/verdict.tsx:21` renders **"It helped"** with a green check.

That is backwards for every hunch where lower is better — bugs, dollars, droopiness, headaches, symptoms. Roughly half of them. The statistics are correct; only the label is wrong.

### The principle

**The app can know direction. It cannot know valence.**

Direction falls out of the arithmetic. Whether "up" is good is a human judgment, and the app is currently guessing at it — wrongly, half the time. This is the same restraint as the rest of the spec: report what happened, do not interpret it.

### The design — two slots, two voices

The product already renders the outcome in two places, and they need not say the same thing:

- **Badge** (`src/components/app/home-view.tsx:70`) — scanned down a list of experiments. Short.
- **Headline** (`src/components/verdict.tsx:21`) — read once, carefully, on the verdict page.

| Situation | Badge | Headline |
|---|---|---|
| Effect matched the prediction | `Confirmed` | **More bugs on the days you skipped the walk** |
| Effect ran the other way | `Reversed` | **Fewer bugs on the days you skipped the walk** |
| Interval straddles zero | `Not confirmed` | **No difference in bugs either way** |
| Too few days | `Not enough days` | **Too few days logged to tell** |

Beneath the headline, the number and its uncertainty, unchanged:

> +2.4 bugs · 95% CI 0.8 to 4.0

**Why split.** The badge gives a scannable word where a list needs one. The headline states the finding in the user's own units, so it never says "it" and never implies a value judgment. Neither slot guesses whether up is good.

**`Reversed` must stay its own badge.** "Not confirmed" reads as a natural home for both *the opposite happened* and *no difference*, and collapsing them discards a real finding — a surprise reversal is the most interesting result an experiment can produce, and a clean null is not the same thing.

**On the word "confirmed."** It is strong for one person over 21 days with a 95% interval. It earns its place in the badge because the badge is a scanning aid and the headline immediately beneath carries the actual claim with its uncertainty attached. It should not appear anywhere it stands alone.

### Prediction capture

`expectedDirection: "up" | "down"` on the hypothesis, written by the Coach at sharpen time — it composes the statement, so it already knows which way the user expects it to go.

**This stages in two independent pieces:**

1. **The headline needs no new data.** Direction and units are already on the verdict row. Ships on its own, and fixes the wrong-valence bug immediately.
2. **The badge needs `expectedDirection`** to separate `Confirmed` from `Reversed`. Follows once the Coach emits the field. Rows without it fall back to a direction word in the badge (`Increase` / `Decrease`).

### Migration

- Rename the stored categories `helped | hurt` -> `increase | decrease`. Deterministic backfill, same sign rule.
- `inconclusive_no_effect` and `inconclusive_insufficient` are unchanged.
- The `CausalEdge` mapping (`helped: "increases"`, `src/lib/memory/causal-graph.ts:18`) becomes an identity — delete the translation layer.
- Rows with no `expectedDirection` keep the full headline (it never needed the field) and show a direction word in the badge instead of `Confirmed` / `Reversed`.
- `src/lib/export.ts:43` follows the **headline**, not the badge — an exported file is read once and carefully, like the verdict page.
- The landing's "Helped, hurt, or no difference" (`src/components/landing/how-it-works.tsx:119`) promises the old framing on the front door. It has to change with the rest or the app contradicts its own pitch before sign-in.
- The Analyst prompt's "Probability the intervention helped (P(effect > 0))" becomes "probability the outcome went up" (`src/mastra/agents/analyst.ts:51`). Its rules for `helped`/`hurt` follow the rename.

---

## Out of scope — logged, not fixed here

- ~~**Cadence.** Per-event outcomes ("dollars per shopping trip") counted against day-based phases.~~ **Fixed 2026-09-03, and not where this predicted.** It was a hypothesis-phrasing defect, not an analysis one: the Coach now has to phrase every outcome so it can be logged daily, with zero on the days nothing happened. "Dollars spent per shopping trip" becomes "dollars spent on groceries today", which is better statistics too — dropping the non-shopping days quietly changes what is being compared. Seven adversarial hunches all came back daily; removing the rule fails the eval on three of them.

- **Intervention adherence** — found while fixing cadence, and genuinely separate. The engine compares readings by *phase label*, not by whether the change was actually applied that day. "Playing basketball makes my knee hurt" logs knee pain daily, so both arms have enough readings, but if they play once a week then six of seven phase-B days had no basketball and the contrast is diluted towards nothing. The Coach already proposes "Played basketball today" as a tracker; the engine ignores trackers. Fixing it means letting a nominated tracker gate which days count as intervention — a real design question, not a patch.
- **Tracker padding.** The Coach returns 4 trackers every time regardless of the hunch.
- **Agent disagreement.** Coach and Designer independently choose scale ranges and can contradict each other inside one trial.

---

## Decided, 2026-09-02

The framing softens to match "occurrence, not cause" — §7. The trigger was finding that "It helped" is not merely loose language but wrong output for any hunch where lower is better.
