# Precompute the verdict, on the user's own calendar

Latency audit item #5. Two parts, one spec: part 2 needs part 1's idea of "today",
so the order matters.

- **Part 1 — local days.** Every "which day is it" decision uses the user's own
  time zone instead of UTC.
- **Part 2 — the verdict sweep.** A nightly Inngest job freezes the verdict of
  every trial that ended at least a full day ago, so the first view reads a row
  instead of waiting ~4s on the Analyst.

Recommended as **two PRs**, part 1 first. Part 1 changes which check-ins are
accepted for every user; it should ship and be watched on its own.

## Why

**The verdict wait.** `GET /api/hunch/[id]/verdict` computes the verdict on the
first view after the schedule ends: belief, classify, `runAnalysis` (the Analyst,
3.6-3.9s measured on 2026-09-19), then one transaction writes the `Verdict`, flips
the hunch to `concluded` and writes the `CausalEdge`. Every later view is a read.
The one slow view is the first, at the moment the product has been building
toward for two to four weeks.

**Why not precompute at the end of the schedule.** The check-in route accepts
corrections for earlier days (`loggedOn`) until the hunch stops being `running`
— which today happens only when the user first views the verdict. Freezing the
verdict the moment the schedule ends would take away "filled in the morning
after" for the final day. So the sweep waits one full day of grace. A user who
opens the hunch inside that day still gets today's inline compute, which also
freezes it — unchanged behaviour.

**Why not `after()` on the last check-in** (considered, dropped): on the last
scheduled day `currentPhase(...).done` is still false, so `classifyVerdict`
returns `null`. There is nothing to compute until the day after.

**Why local days.** `currentPhase`, `startDateFor`, the check-in route and home
all cut days at UTC midnight. For a user in California that is 4-5pm local: their
8pm check-in files under *tomorrow*, and on the last day of a trial it is refused
as "This trial is complete." In India, a 2am start lands day 1 on the previous
calendar day. The stored `User.timeZone` (recorded at trial start and by the
reminder settings, default `"UTC"`) already knows the right answer; only the
reminder sweep uses it today. Part 2's grace window is measured in days, so it
inherits whichever definition of a day the app uses — fixing it first means the
grace is a real local day.

## Part 1 — local days

**Representation does not change.** A day is still stored as UTC midnight of a
calendar date (`CheckIn.loggedOn`, `Protocol.startedAt`), and `currentPhase` /
`utcDaysBetween` still compare those. What changes is only *which calendar date
"now" is*: `localDateIn(user.timeZone, now)` instead of `utcMidnight(now)`. No
migration.

`localDateIn` (today in `src/lib/reminders.ts`) moves to `src/lib/schedule.ts`
next to `utcMidnight`, and `schedule.ts` gains:

```ts
/** Today, in the user's zone, as the UTC-midnight key a check-in is filed under. */
export function localToday(timeZone: string, now: Date = new Date()): Date
```

`reminders.ts` re-imports it; its behaviour is unchanged.

Call sites (server — the stored zone is the authority):

| Site | Today | After |
|---|---|---|
| `start/route.ts` `startDateFor(startOn)` | UTC today | `startDateFor(startOn, zone)` — the zone the request just sent, else the stored one |
| `checkin/route.ts:95` `utcToday()` | UTC today | `localToday(user.timeZone)` |
| `belief/route.ts:68` `currentPhase(..., new Date())` | UTC | `currentPhase(..., localToday(zone))` |
| `verdict/route.ts:117` same | UTC | same |
| `lib/home.ts:63` `today` / `now` | UTC | `localToday(zone)` for both the phase and the day counter |
| `inngest/functions.ts` reminder | already local | unchanged |

`startDateFor` changes signature to `(startOn, timeZone, now?)`. Each route
already loads the hunch; the user's zone comes from one extra `select` on the
user (or `include: { user: { select: { timeZone: true } } }` on the hunch query).

**The check-in POST refreshes the stored zone**, exactly as the start route
does: the client sends `Intl…resolvedOptions().timeZone`, the server stores it
if `isKnownZone`, and uses it for that request. So a user who travels is judged
by the zone of the device in their hand, and the server and the check-in screen
agree about what "today" is.

Client sites (the browser's own zone, which the POST above keeps equal to the
stored one):

| Site | After |
|---|---|
| `adherence-strip.tsx:44` `today = new Date()` | browser-local calendar date as UTC midnight |
| `check-in.tsx:465` `startsIn` | same |
| check-in POST body (the check-in mutation) | adds `timeZone: browserZone()`, as `use-start-trial.ts` does |

Date *formatting* (`DATE_FMT` with `timeZone: "UTC"`) stays: it renders a
UTC-midnight key as its own calendar date, which is correct.

**In-flight trials.** A trial started before this ships keeps its stored
`startedAt`. For users far from UTC the schedule may shift by one day relative
to what they saw on the first day. Accepted: rewriting anchors is riskier than
a one-day shift. The owner confirms before merge whether anyone is mid-trial.

**Tests (part 1).**
- `localToday`: `America/Los_Angeles` at 2026-09-23T03:00Z is 2026-09-22;
  `Asia/Kolkata` at 2026-09-22T20:00Z is 2026-09-23; `UTC` equals `utcMidnight`.
- Check-in route: a Los Angeles user posting at 20:00 local on the last scheduled
  day is accepted and filed under that local date (today: refused).
- Start route: "today" for a Kolkata user at 02:00 local anchors on the local
  date.
- Existing suites stay green; tests that construct dates in UTC and never set a
  zone keep working because the default zone is `"UTC"`.

## Part 2 — the verdict sweep

**Shape:** one Inngest function, one `step.run` per hunch. Chosen over a sweep
that fans out to a per-hunch function (reminders' shape) because it is less code
and the volume is small; the one weakness — a hunch that exhausts its retries
failing the run — is closed with a `try/catch` around each step.

### Files

- **`src/lib/conclude-trial.ts` (new).** The block in `verdict/route.ts` from
  "trial hasn't started" through the transaction and its unique-race fallback,
  moved unchanged. Takes the loaded hunch (the route's existing `include`, which
  it exports as `VERDICT_INCLUDE`) plus the user id; returns
  `{ ok: true, row } | { ok: false, status: 409 | 500 | 502, error }`.
  Nothing about which requests succeed, or with what, changes.
- **`src/app/api/hunch/[id]/verdict/route.ts`.** Keeps auth, the load, the
  exposure report and `toDto`. The middle becomes one `concludeTrial` call.
- **`src/inngest/functions.ts`.** Adds `verdictSweep` and `isDueForVerdict`,
  registers the function in `functions`.

### Eligibility

```ts
/** The schedule had already ended by yesterday, in the user's zone. */
export function isDueForVerdict(
  startedAt: Date, design: ProtocolDesign, timeZone: string, now: Date,
): boolean {
  const yesterday = new Date(localToday(timeZone, now).getTime() - 86_400_000);
  return currentPhase(startedAt, design, yesterday).done;
}
```

The query: `status: "running"`, `archivedAt: null`, `verdict: null`,
`protocol: { startedAt: { not: null }, safetyState: { not: "observe-only" } }`,
selecting the protocol's `design` and `startedAt`, the hypothesis's
`outcomeMetric`, and the user's `timeZone`. The date test runs in JS because a
schedule's length lives inside the design JSON.

Archived hunches are skipped: filed away already means "off" (reminders skip them
too), and a verdict nobody reads still costs an Analyst call and writes a
`CausalEdge` that shapes future recall. Abandoned trials are not skipped — they
conclude `inconclusive_insufficient`, which is true.

### The function

```
id: "verdict-sweep", cron: "15 0 * * *"   // daily, 00:15 UTC
1. step.run("find-due")        -> hunch ids (isDueForVerdict)
2. for each id:
     try step.run(`conclude-${id}`):
       reload with VERDICT_INCLUDE; skip if a verdict now exists or the hunch
       is no longer running/unarchived; else concludeTrial
     catch -> failed++
3. return { due, concluded, failed }
```

Daily is enough: with local grace, a hunch becomes due at most once a day, and
the worst case is a verdict precomputed up to 24h after the grace ends — during
which the inline path still serves it.

### Failures and races

- **Analyst fails:** `concludeTrial` returns 502, the step throws, Inngest retries
  it. After the last retry the loop catches, counts it and moves on. The next
  night picks the hunch up again; the user's first view computes inline as today.
- **User views while the step runs:** already handled — `@@unique(hunchId)` on
  `Verdict` rejects the second insert and the loser serves the stored row.
- **A check-in lands after the sweep froze it:** refused as not running, as
  after any concluded verdict. Only possible after the full grace day.

### Tests (part 2)

- `isDueForVerdict`: last scheduled day -> false; first day after the end (grace)
  -> false; the day after that -> true; the same instants in `Asia/Kolkata` and
  `America/Los_Angeles` land on the right side of local midnight.
- Verdict route: the existing tests pass untouched — the extraction changes no
  behaviour.
- `verdictSweep` with a mocked `step`: a due hunch concludes; one whose
  `concludeTrial` throws is counted as failed and the next one still concludes;
  a hunch that gained a verdict between `find-due` and its step is skipped.

## Out of scope

- Telling the user their verdict is ready (email / push).
- Re-opening a frozen verdict when a late correction arrives.
- #5's measurement: the win is one ~4s wait per trial, for users who come back a
  day or more after the end; no bench change.
