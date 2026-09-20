# Intervention adherence — design

**Date:** 2026-09-09
**Status:** spec, not yet planned or built
**Closes:** the "intervention adherence" item logged out of scope in `2026-09-02-parameters-and-safety-design.md`

---

## The bug

The engine sorts a day's reading into an arm by `CheckIn.phase` (`src/lib/parameters.ts:89`, `primaryBeliefRows`), and `CheckIn.phase` is the calendar's answer, not the user's: the check-in route asks `currentPhase(startedAt, design, loggedOn)` (`src/app/api/hunch/[id]/checkin/route.ts`) and stores whatever the schedule says the date is. Nothing anywhere asks whether the change being tested actually happened that day.

For most trials that is fine. "No coffee after 2pm" is something a person can do on every day of phase B, so the phase label and the exposure are the same fact.

For some trials it is a fiction. Take the hunch the previous spec found this with: _playing basketball makes my knee hurt_. Knee pain is loggable daily, so both arms fill up with readings and nothing looks wrong. But the user plays once a week. Six of the seven phase-B days had no basketball on them, and their knee pain sits in the B arm diluting the contrast towards nothing. The trial produces a clean, well-populated, wrong answer — the worst kind, because "not enough days" at least tells the truth.

Scheduling harder does not fix it. The app cannot put basketball on a Tuesday; a pickup game needs other people, a court, and a body that feels like playing. The intervention is not on demand, and a protocol that pretends otherwise is asking the user to fake it.

## The discriminating question

**Can the person apply this change on any day they choose?**

One bit, knowable before the trial starts, and it decides which of two honest designs a hunch gets:

| Answer                                                             | Design                 | Arms come from               |
| ------------------------------------------------------------------ | ---------------------- | ---------------------------- |
| Yes — "skip coffee after 2pm", "10k steps", "magnesium at bedtime" | ABA phases, as today   | The schedule                 |
| No — "play basketball", "go to the sauna", "have a big night out"  | One observation window | Whether it happened that day |

This spec builds the second shape and leaves the first exactly as it is.

## Why the arms move rather than the days getting dropped

Three alternatives were weighed:

- **Drop the diluted B days.** Keep ABA; throw away phase-B days where the intervention did not happen. Plays once a week, so a 7-day phase B yields one reading, and every sporadic trial dies as "not enough days". It also discards real signal — the baseline days they _did_ play carry exactly the contrast being looked for.
- **Re-sort every day but keep showing the schedule.** Same arithmetic as what is proposed here, but the phases, washouts and adherence strip stay on screen while the verdict quietly ignores them. Two stories in one interface, and the one the user is looking at is the wrong one.
- **Report the dilution and analyse nothing differently.** Honest and cheap, but leaves a diluted number standing as the result.

The chosen shape drops the schedule where the schedule was never real, keeps every day of data, and says out loud what it is comparing. It buys that with a loss worth naming: **exposure is self-selected, so an observational trial is a correlation, not a randomised contrast.** People play basketball on days their knee already feels good, which biases the comparison in a direction nothing here can measure. This is acceptable only because the product has already, deliberately, stopped claiming causation — §7 of the previous spec settled that the app reports which way a number moved and never whether that is good or why. An observational trial fits that framing exactly. It must not be sold as anything stronger, and §6 below is how the interface keeps that promise.

---

## 1. `shape` on the design

```ts
export const protocolShapeSchema = z.enum(["phased", "observational", "diary"]);
```

added to `protocolDesignSchema` (`src/lib/schemas/protocol.ts`), and derived by `parseStoredDesign` for rows written before it existed: one phase → `diary`, two or more → `phased`.

**Note on the diary.** Two comments in `schemas/protocol.ts` (lines 35 and 117) claim `phases.length === 1` is what marks a diary. The code does not agree: every real check is `safetyState === "observe-only"` (`src/app/api/hunch/[id]/verdict/route.ts:88`, `src/components/hunch/hunch-dashboard.tsx:57`). So an observational trial — also one window — was never in danger of being misread as a diary. The comments are stale and get corrected as part of this work; `shape` becomes the field that answers "what kind of design is this?" for the engine and the Designer, and `safetyState` keeps its own job, which is safety.

## 2. Who decides, and how a wrong guess gets fixed

The Coach decides, the user overrides.

`sharpenedHypothesisSchema` (`src/lib/schemas/hypothesis.ts`) gains:

```ts
schedulable: z.boolean().default(true),
exposure: trackerSchema.optional(),   // binary; required when schedulable is false
```

with a refine: `schedulable: false` and no `exposure` is not a valid sharpening. On a schedulable hunch the Coach still emits an `exposure` when the intervention is a discrete daily act someone can skip ("Skipped coffee after 2pm"), and omits it when the phase itself is the whole story ("slept with the window open"). There it never touches the arms — it is the adherence count of §6.

The Coach composes the statement, so it already holds the intervention verb and is the cheapest place to ask the question. It is also the place most likely to be wrong about someone's life — a person with a home sauna can use it daily and a person with a gym membership cannot — so the answer is never final. The confirm gate renders it as one editable line:

> **We'll watch the days you play, rather than ask you to play on a schedule.** — _change_

Flipping it to schedulable drops the exposure parameter and restores the ABA design; flipping the other way asks for the exposure label. No new step in the flow: the gate already exists and already lists editable parameters.

Persisted as `Hypothesis.schedulable Boolean @default(true)`. Existing rows are schedulable, which is what they were built as.

**Eval.** A hypothesis-quality eval case per side — an on-demand intervention that must come back `schedulable: true`, and an opportunity-dependent one that must come back `false` with a sensible exposure label. Same pattern as the daily-loggable rule added in PR #32, which is the precedent for a Coach rule that has to hold under adversarial input.

## 3. The exposure parameter

`Parameter.isExposure Boolean @default(false)`, mirroring `isPrimary`.

| Rule                                                 | Why                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| At most one per hunch, either shape                  | It is the arm assignment where the shape is observational. Two of them is not a design this engine has.                                                                                                                                                                                                                                                                                           |
| Required on an observational hunch                   | Without it there are no arms at all.                                                                                                                                                                                                                                                                                                                                                              |
| Optional on a phased one, where it is reporting-only | "Did you actually skip the coffee?" never moves a day between arms on a scheduled trial — the schedule assigns those — but it is how a user learns their phase B was adhered to on nine days out of fourteen. §6.                                                                                                                                                                                 |
| Always `binary`                                      | "Did it happen today?" A dose or a duration is a different experiment, and a `scale` exposure has no arm boundary.                                                                                                                                                                                                                                                                                |
| Never also the primary                               | The primary is what gets compared; the exposure is what it is compared across. One row cannot be both sides of the contrast.                                                                                                                                                                                                                                                                      |
| Cannot be retired on an observational hunch          | `src/app/api/hunch/[id]/parameters/[parameterId]/route.ts` already refuses to retire the primary, with "This is the measure your result is built on — it has to keep running." An arm-assigning exposure gets the same 409: _This is how we tell your days apart — it has to keep running._ On a phased hunch it retires like any other tracker, because losing it costs a count, not the result. |

It is created at confirm time from the Coach's `exposure`, like any other parameter, and it appears in the daily check-in as a normal binary control. The user sees a yes/no question; nothing in the interface calls it "the exposure".

## 4. What the engine compares

`primaryBeliefRows` becomes:

```ts
armRows(checkIns, primaryId, { shape, exposureId }): CheckInRow[]
```

- **phased** — unchanged. `phase` is the stored label.
- **observational** — the arm is that day's exposure reading: `1` → `"B"`, `0` → `"A"`.
- **either shape, day missing the outcome** — no row, as today.
- **observational, day with an outcome but no exposure answer** — **dropped**, and counted. An unanswered exposure is not a "no": treating it as one would quietly stuff every lazy check-in into the baseline arm and bias the result towards whatever the user does when they cannot be bothered to log.

Everything downstream is unchanged — `computeBelief` still receives `{ phase, value }[]` and still picks its model from `engineOutcomeType`.

**The arm is derived at read time, never stored.** `CheckIn.phase` keeps being written by the schedule, because loggability, the day counter, the adherence strip and "done" all read it and all still work. In an observational trial that stored label carries no arm meaning, which is a comment on the `CheckIn` model and a comment at the top of `armRows`. Deriving rather than storing is what makes a correction work: the adherence strip already lets a user fix yesterday's reading, and fixing "did I play?" has to re-sort the day. A stored arm would go stale the moment they did.

**`src/lib/export.ts` writes the derived arm**, not `c.phase` (lines 78 and 131). An export is the record of what was compared; a column reading `B` for a day with no basketball on it would be wrong in a file that outlives the app.

## 5. The observational design

Built deterministically, in the same spirit as `observeOnlyDesign` (`src/lib/schemas/protocol.ts:120`) — the LLM is not asked to invent a structure with no phases in it:

```ts
observationalDesign(outcomeMetric, exposureLabel): ProtocolDesign
```

- One phase entry, `label: "A"`, `kind: "baseline"`, `days: OBSERVATION_DAYS` (21). Twenty-one is chosen against `MIN_PER_ARM = 3` (`src/lib/verdict.ts:6`): a once-a-week exposure clears the floor with a day to spare, and a twice-a-week one clears it comfortably. Shorter windows make the insufficiency verdict the common case.
- `washoutDays: 0`. There is nothing to wash out of — the user is living normally throughout.
- `action` names both logs: _Live as you normally would. Each day, log whether you played basketball, and log your knee pain._
- `shape: "observational"`.

The Protocol Designer still runs and still supplies confounders, controls, instructions and the safety review; only the phase structure is taken out of its hands. Its prompt (`src/mastra/agents/protocol-designer.ts:29`, "phases: exactly three") gains the observational branch.

`currentPhase`, `adherenceStrip`, `totalDays` and the check-in's loggability rules need no changes: they walk one phase correctly today, because a diary already does.

## 6. Honesty reporting — both shapes

The belief and verdict payloads gain:

```ts
exposure: { exposed: number; unexposed: number; unknown: number } | null
```

`null` when the hunch has no exposure parameter.

- **On the verdict page**, stated plainly under the headline: _You played on 6 of 21 days._ And when days were dropped: _3 days had no answer either way, so they aren't in the comparison._
- **While running**, the same count on the dashboard, so a user whose exposure arm is starving finds out on day 9 rather than at the end.
- **When an arm is thin**, `classifyVerdict` already returns `inconclusive_insufficient` below three per arm. The badge stays "Not enough days"; the headline names the actual cause — _Too few days with basketball to tell_ — because "not enough days" is false when the user logged all twenty-one of them.
- **Phased trials get the same counts** whenever they carry an exposure (§3). It changes nothing about their arms — the schedule assigns those — and it is how a user learns their scheduled trial was adhered to on nine of fourteen intervention days. There the count is over the phase-B days only; on an observational trial it is over the whole window.

The observational verdict copy also carries the correlational caveat once, in the user's own words rather than a disclaimer: _These are the days you played compared with the days you didn't — you chose which were which, so this shows what went together, not what caused what._

## 7. What the user sees

- **Confirm gate** — the editable shape line from §2, and the exposure listed among the parameters like any other daily question.
- **Protocol view** — `protocol-stepper.tsx` renders "phase 1 / 3" and steps between phases. An observational trial has one window and no steps, so it renders as a single card: what to do, how long, what to log. The stepper is not taught a one-phase case; the view branches on `shape`.
- **Check-in** — unchanged. One more binary question in a list of daily questions.
- **Adherence strip** — unchanged in shape, but an observational trial's logged days carry a mark for the exposed ones, which makes the count in §6 something the user can see rather than read.

## 8. Migration

Additive, and nothing running changes:

- `Hypothesis.schedulable Boolean @default(true)` — every existing hypothesis was built as a scheduled trial and stays one.
- `Parameter.isExposure Boolean @default(false)`.
- `ProtocolDesign.shape` is derived on parse for stored designs, so no data migration and no rewrite of stored JSON. New designs write it.
- No running trial changes shape mid-flight. The decision is made before a trial starts, and there is no path that re-shapes a started one — re-sorting a user's days underneath them would rewrite a result they have already been watching.

## 9. Testing

Test-first per `RULES.md §3`; the engine and schema work is real logic, not glue.

- `armRows` — phased passthrough; observational sorting by exposure; unknown-exposure days dropped and counted; missing primary; a corrected exposure moving a day between arms.
- `observationalDesign` — shape, single phase, zero washout, both labels in the action text.
- `parseStoredDesign` — legacy one-phase → `diary`, legacy multi-phase → `phased`, explicit shape preserved.
- Schema refines — `schedulable: false` without an exposure fails; two exposures fail; an exposure that is also primary fails; a non-binary exposure fails.
- Retire route — an observational exposure returns 409 with its own wording; a phased one retires normally.
- Exposure counts — observational counts over the whole window, phased counts over the phase-B days only.
- Export — observational rows carry the derived arm.
- Verdict copy — thin-arm headline names the exposure; the exposure counts render; the correlational line appears on observational verdicts only.
- Coach eval — one schedulable case, one not, per §2.

## 10. Out of scope

- **Dose or duration as exposure.** "Played for 90 minutes" is a different and better experiment; binary first.
- **Reshaping a running trial.** §8.
- **Adjusting for the self-selection bias.** Naming it in the copy is the whole treatment. Statistical adjustment needs covariates the app does not collect.
- **Tracker padding** and **agent disagreement on scale ranges** — still open from the previous spec, still untouched here.
