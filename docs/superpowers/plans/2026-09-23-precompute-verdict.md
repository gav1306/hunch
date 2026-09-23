# Precompute the Verdict, on the User's Own Calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every "which day is it" decision uses the user's own time zone, and a nightly Inngest sweep freezes the verdict of every trial that ended a full local day ago, so the first verdict view reads a row instead of waiting ~4s on the Analyst.

**Architecture:** Part 1 keeps the stored day representation (UTC midnight of a calendar date) and changes only how "today" is chosen: `localToday(User.timeZone)` on the server, the browser's own calendar date on the client. Part 2 moves the verdict route's compute-and-persist block into `concludeTrial()` unchanged, and adds one Inngest cron function that calls it once per due hunch inside its own `step.run`.

**Tech Stack:** Next 16 route handlers, Prisma 7 (client at `@/generated/prisma/client`), Inngest v4 (`src/inngest/`), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-precompute-verdict-design.md`

## Global Constraints

- RULES.md §2: **the owner commits. Claude runs no `git` commands.** Every "Commit" step below means: run all checks green, then report "ready to commit" with the suggested message. Never commit red.
- A step is ready only when `npm run typecheck`, `npm run lint` and `npm test` are all clean. Watch the vitest summary for **failed files**, not just failed tests — a broken `vi.mock` fails a whole file and the summary still says "passed" with a smaller count. Compare the test count against the previous task's.
- No new dependencies.
- No migration. Days stay stored as UTC midnight of a calendar date (`CheckIn.loggedOn`, `Protocol.startedAt`).
- Unknown or missing zones fall back to `"UTC"` — today's behaviour, byte for byte.
- Two PRs: Tasks 1-5 (part 1, local days), then Tasks 6-8 (part 2, the sweep), branched from part 1.
- Grace: a hunch is due only once its schedule had already ended **by yesterday, in the user's zone**.
- The sweep skips archived hunches, hunches with a verdict, and `observe-only` protocols.

---

## File Structure

| File | Part | Responsibility |
|---|---|---|
| `src/lib/zone.ts` (new, server-only) | 1 | `isKnownZone`, `localToday`, `userTimeZone` |
| `src/lib/browser-day.ts` (new, client-safe) | 1 | `browserZone`, `browserToday` |
| `src/lib/schemas/parameter.ts` | 1 | check-in input accepts `timeZone` |
| `src/app/api/hunch/[id]/checkin/route.ts` | 1 | local today; refresh stored zone |
| `src/hooks/use-checkin.ts` | 1 | send `timeZone` |
| `src/app/api/hunch/[id]/start/route.ts` | 1 | anchor on the local date |
| `src/app/api/reminders/route.ts`, `src/hooks/use-start-trial.ts`, `src/components/app/reminder-settings.tsx` | 1 | use the shared zone helpers (dedupe) |
| `src/app/api/hunch/[id]/belief/route.ts`, `…/verdict/route.ts`, `src/lib/home.ts` | 1 | local today |
| `src/components/adherence-strip.tsx`, `src/components/check-in.tsx` | 1 | browser-local today |
| `src/lib/conclude-trial.ts` (new) | 2 | belief → classify → Analyst → persist |
| `src/inngest/verdict-sweep.ts` (new) | 2 | `isDueForVerdict`, `runVerdictSweep` |
| `src/inngest/functions.ts` | 2 | registers `verdictSweep` |

`runVerdictSweep` lives in its own file and takes `step` as an argument so it can be tested without Inngest; `functions.ts` only wraps it.

---

## Part 1 — local days

### Task 1: Zone helpers

**Files:**
- Create: `src/lib/zone.ts`, `src/lib/zone.test.ts`
- Create: `src/lib/browser-day.ts`, `src/lib/browser-day.test.ts`
- Modify: `src/app/api/hunch/[id]/start/route.ts:118-126` (delete local `isKnownZone`, import it)
- Modify: `src/app/api/reminders/route.ts:64-72` (same)
- Modify: `src/hooks/use-start-trial.ts:14-21`, `src/components/app/reminder-settings.tsx:~13-20` (delete local `browserZone`, import it)

**Interfaces:**
- Produces:
  - `isKnownZone(zone: string): boolean`
  - `localToday(timeZone: string, now?: Date): Date` — the user's calendar date, at UTC midnight
  - `userTimeZone(userId: string): Promise<string>` — stored zone, `"UTC"` when the user row is missing
  - `browserZone(): string | undefined`
  - `browserToday(now?: Date): Date` — the browser's calendar date, at UTC midnight

- [ ] **Step 1: Write the failing tests**

`src/lib/zone.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: vi.fn() } } }));

import { isKnownZone, localToday, userTimeZone } from "@/lib/zone";
import { db } from "@/lib/db";

describe("localToday", () => {
  it("is still yesterday in Los Angeles when UTC has rolled over", () => {
    // 03:00Z on the 23rd is 20:00 on the 22nd in PDT.
    const at = new Date("2026-09-23T03:00:00.000Z");
    expect(localToday("America/Los_Angeles", at).toISOString()).toBe("2026-09-22T00:00:00.000Z");
  });

  it("is already tomorrow in Kolkata before UTC rolls over", () => {
    // 20:00Z on the 22nd is 01:30 on the 23rd in IST.
    const at = new Date("2026-09-22T20:00:00.000Z");
    expect(localToday("Asia/Kolkata", at).toISOString()).toBe("2026-09-23T00:00:00.000Z");
  });

  it("matches UTC midnight for UTC", () => {
    const at = new Date("2026-09-22T23:59:59.000Z");
    expect(localToday("UTC", at).toISOString()).toBe("2026-09-22T00:00:00.000Z");
  });

  it("falls back to UTC for a zone it can't read", () => {
    const at = new Date("2026-09-23T03:00:00.000Z");
    expect(localToday("Not/AZone", at).toISOString()).toBe("2026-09-23T00:00:00.000Z");
  });
});

describe("isKnownZone", () => {
  it("accepts an IANA zone and refuses garbage", () => {
    expect(isKnownZone("Asia/Kolkata")).toBe(true);
    expect(isKnownZone("Not/AZone")).toBe(false);
  });
});

describe("userTimeZone", () => {
  it("returns the stored zone", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ timeZone: "Asia/Kolkata" } as never);
    expect(await userTimeZone("u1")).toBe("Asia/Kolkata");
  });

  it("falls back to UTC when there is no user row", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(null);
    expect(await userTimeZone("u1")).toBe("UTC");
  });
});
```

`src/lib/browser-day.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { browserToday } from "@/lib/browser-day";

describe("browserToday", () => {
  it("keys the browser's own calendar date at UTC midnight", () => {
    // Built with the local-time constructor, so this holds in any TZ the suite runs in.
    const lateEvening = new Date(2026, 8, 22, 23, 30);
    expect(browserToday(lateEvening).toISOString()).toBe("2026-09-22T00:00:00.000Z");
  });

  it("keys just after local midnight to the new day", () => {
    const justAfter = new Date(2026, 8, 23, 0, 5);
    expect(browserToday(justAfter).toISOString()).toBe("2026-09-23T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/zone.test.ts src/lib/browser-day.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/zone"` / `"@/lib/browser-day"`.

- [ ] **Step 3: Implement**

`src/lib/zone.ts`:

```ts
import "server-only";

import { db } from "@/lib/db";
import { localDateIn } from "@/lib/reminders";

/**
 * Which calendar day it is for a user.
 *
 * Days are stored as UTC midnight of a calendar date — `CheckIn.loggedOn`,
 * `Protocol.startedAt` — and that doesn't change here. What does is which date
 * "now" is: the user's own, from the zone recorded at trial start (and by the
 * reminder settings), rather than UTC's. Cutting days at UTC midnight put a
 * Californian's 8pm check-in on tomorrow, and refused it outright on the last
 * day of a trial.
 */

/** Does this runtime recognise the zone? Anything else is not worth storing. */
export function isKnownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Today in `timeZone`, as the UTC-midnight key a check-in is filed under. */
export function localToday(timeZone: string, now: Date = new Date()): Date {
  return localDateIn(timeZone, now);
}

/** The user's stored zone. `"UTC"` — the column's default — when there is no row. */
export async function userTimeZone(userId: string): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { timeZone: true } });
  return user?.timeZone ?? "UTC";
}
```

`src/lib/browser-day.ts`:

```ts
/**
 * The browser's side of "which day is it". Client-safe: no server imports.
 *
 * The server judges a check-in by the user's stored zone, and every check-in
 * refreshes that zone from `browserZone()`, so the two agree on the device the
 * user is holding.
 */

/** The browser's own zone, when it will tell us. */
export function browserZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** The browser's calendar date, keyed at UTC midnight like `CheckIn.loggedOn`. */
export function browserToday(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}
```

Then dedupe:
- In `src/app/api/hunch/[id]/start/route.ts` and `src/app/api/reminders/route.ts`: delete the file-local `function isKnownZone(...)` (and its doc comment) and add `import { isKnownZone } from "@/lib/zone";`.
- In `src/hooks/use-start-trial.ts` and `src/components/app/reminder-settings.tsx`: delete the file-local `function browserZone()` (and its doc comment) and add `import { browserZone } from "@/lib/browser-day";`.

- [ ] **Step 4: Run to verify they pass, then the whole suite**

Run: `npx vitest run src/lib/zone.test.ts src/lib/browser-day.test.ts` — Expected: PASS (9 tests).
Run: `npm run typecheck && npm run lint && npm test` — Expected: clean; test count = previous + 9, no failed files. `start/route.test.ts` passes untouched (it mocks `@/lib/db`, which `zone.ts` imports — if it fails to load with a `server-only` error, add `vi.mock("server-only", () => ({}));` at its top).

- [ ] **Step 5: Ready to commit**

Suggested message: `feat(zone): one helper for which day it is, per user`

---

### Task 2: Check-ins land on the user's own day

**Files:**
- Modify: `src/lib/schemas/parameter.ts:106-117`
- Modify: `src/app/api/hunch/[id]/checkin/route.ts:7, 95, ~131-140`
- Modify: `src/hooks/use-checkin.ts:34-41`
- Test: `src/app/api/hunch/[id]/checkin/route.test.ts`

**Interfaces:**
- Consumes: `isKnownZone`, `localToday`, `userTimeZone` (Task 1); `browserZone` (Task 1)
- Produces: `checkInValuesInputSchema` accepts optional `timeZone: string`

- [ ] **Step 1: Write the failing tests**

At the top of `route.test.ts`, below the existing `vi.mock` calls, add:

```ts
vi.mock("server-only", () => ({}));
vi.mock("@/lib/zone", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/zone")>()),
  userTimeZone: vi.fn(async () => "UTC"),
}));
```

In the existing `vi.mock("@/lib/db", …)` object add `user: { update: vi.fn() },`. Add `import { userTimeZone } from "@/lib/zone";` and `afterEach` to the vitest import.

Append this describe block:

```ts
describe("local days", () => {
  // A 14-day trial whose last day is 22 Sep: days 9..22 Sep.
  const lastDay = {
    ...running,
    protocol: { ...running.protocol, startedAt: new Date("2026-09-09T00:00:00.000Z") },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // 20:00 PDT on 22 Sep — already 23 Sep in UTC.
    vi.setSystemTime(new Date("2026-09-23T03:00:00.000Z"));
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(db.hunch.findFirst).mockResolvedValue(lastDay as never);
  });
  afterEach(() => vi.useRealTimers());

  it("accepts a Californian's evening log on the last day, filed under their date", async () => {
    vi.mocked(userTimeZone).mockResolvedValue("America/Los_Angeles");

    const res = await POST(
      req({ values: [{ parameterId: "p1", value: 7 }], timeZone: "America/Los_Angeles" }),
      params,
    );

    expect(res.status).toBe(201);
    const where = vi.mocked(db.checkIn.upsert).mock.calls[0][0].where;
    expect(where.hunchId_loggedOn.loggedOn.toISOString()).toBe("2026-09-22T00:00:00.000Z");
    // Same zone as stored: nothing to refresh.
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("still refuses that log for a user whose zone is UTC", async () => {
    vi.mocked(userTimeZone).mockResolvedValue("UTC");
    const res = await POST(req({ values: [{ parameterId: "p1", value: 7 }] }), params);
    expect(res.status).toBe(409);
  });

  it("stores the zone the device sent when it differs, after the log is written", async () => {
    vi.mocked(userTimeZone).mockResolvedValue("UTC");

    const res = await POST(
      req({ values: [{ parameterId: "p1", value: 7 }], timeZone: "America/Los_Angeles" }),
      params,
    );

    expect(res.status).toBe(201);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { timeZone: "America/Los_Angeles" },
    });
  });

  it("ignores a zone it can't read", async () => {
    vi.mocked(userTimeZone).mockResolvedValue("America/Los_Angeles");
    const res = await POST(
      req({ values: [{ parameterId: "p1", value: 7 }], timeZone: "Not/AZone" }),
      params,
    );
    expect(res.status).toBe(201);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run 'src/app/api/hunch/[id]/checkin/route.test.ts'`
Expected: "accepts a Californian's evening log…" FAILS with status 409 (UTC today is past the end); "stores the zone…" FAILS (`update` not called). The UTC-refusal test passes already.

- [ ] **Step 3: Implement**

`src/lib/schemas/parameter.ts`, inside `checkInValuesInputSchema`, after `loggedOn`:

```ts
  /**
   * The browser's IANA zone. Decides which calendar day "today" is, and is
   * stored on the user when it differs — see `src/lib/zone.ts`.
   */
  timeZone: z.string().trim().min(1).max(64).optional(),
```

`src/app/api/hunch/[id]/checkin/route.ts`:
- Imports: change the schedule import to `import { currentPhase, utcMidnight } from "@/lib/schedule";` and add `import { isKnownZone, localToday, userTimeZone } from "@/lib/zone";`.
- Replace `const today = utcTodayFrom();` with:

```ts
  // The user's own day, judged by the zone of the device in their hand — a
  // Californian's 8pm log is still today, not tomorrow in UTC.
  const storedZone = await userTimeZone(session.user.id);
  const sentZone = parsed.data.timeZone;
  const zone = sentZone && isKnownZone(sentZone) ? sentZone : storedZone;
  const today = localToday(zone);
```

- Directly after the `db.checkIn.upsert(...)` call (so a refused day writes nothing), add:

```ts
  if (zone !== storedZone) {
    await db.user.update({ where: { id: session.user.id }, data: { timeZone: zone } });
  }
```

`src/hooks/use-checkin.ts`: add `import { browserZone } from "@/lib/browser-day";` and change the body to:

```ts
    body: JSON.stringify({ values, timeZone: browserZone(), ...(loggedOn ? { loggedOn } : {}) }),
```

- [ ] **Step 4: Run to verify they pass, then the whole suite**

Run: `npx vitest run 'src/app/api/hunch/[id]/checkin/route.test.ts'` — Expected: PASS, all existing tests plus 4 new.
Run: `npm run typecheck && npm run lint && npm test` — Expected: clean, no failed files.

- [ ] **Step 5: Ready to commit**

Suggested message: `fix(checkin): file a log under the user's own day, not UTC's`

---

### Task 3: A trial starts on the user's own date

**Files:**
- Modify: `src/app/api/hunch/[id]/start/route.ts:78-103`
- Test: `src/app/api/hunch/[id]/start/route.test.ts`

**Interfaces:**
- Consumes: `isKnownZone`, `localToday` (Task 1); existing `startDateFor(startOn, now)` — unchanged, it normalises with `utcMidnight`, which is a no-op on a day key.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("POST /api/hunch/[id]/start", …)`:

```ts
  describe("on the user's own date", () => {
    afterEach(() => vi.useRealTimers());

    it("anchors 'today' on the Kolkata date at 01:30 IST, not the UTC one", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-15T20:00:00.000Z")); // 01:30 on the 16th in IST

      const res = await POST(req({ startOn: "today", timeZone: "Asia/Kolkata" }), params);

      expect(res.status).toBe(200);
      const data = vi.mocked(db.protocol.update).mock.calls[0][0].data as { startedAt: Date };
      expect(data.startedAt.toISOString()).toBe("2026-01-16T00:00:00.000Z");
    });

    it("uses the stored zone when the request sends none", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-15T20:00:00.000Z"));
      vi.mocked(db.user.findUnique).mockResolvedValue({
        reminderHour: 20,
        remindersOptOut: false,
        timeZone: "Asia/Kolkata",
      } as never);

      await POST(req({ startOn: "today" }), params);

      const data = vi.mocked(db.protocol.update).mock.calls[0][0].data as { startedAt: Date };
      expect(data.startedAt.toISOString()).toBe("2026-01-16T00:00:00.000Z");
    });
  });
```

Add `afterEach` to the vitest import. If the route answers 201 rather than 200, match the status the existing happy-path test in this file asserts.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run 'src/app/api/hunch/[id]/start/route.test.ts'`
Expected: both new tests FAIL — `startedAt` is `2026-01-15T00:00:00.000Z`.

- [ ] **Step 3: Implement**

In `start/route.ts`: add `import { localToday } from "@/lib/zone";` (next to the `isKnownZone` import from Task 1). Delete the line `const startedAt = startDateFor(parsed.data.startOn);`. Add `timeZone: true` to the `db.user.findUnique` select. After the existing `const zone = parsed.data.timeZone;` line, add:

```ts
  // Day 1 is a date in the user's calendar. The zone they just sent wins; a
  // client that sent none falls back to the one on file.
  const knownZone = zone && isKnownZone(zone) ? zone : undefined;
  const startedAt = startDateFor(
    parsed.data.startOn,
    localToday(knownZone ?? user?.timeZone ?? "UTC"),
  );
```

In the transaction's `db.user.update` data, replace `...(zone && isKnownZone(zone) ? { timeZone: zone } : {})` with `...(knownZone ? { timeZone: knownZone } : {})`.

- [ ] **Step 4: Run to verify they pass, then the whole suite**

Run: `npx vitest run 'src/app/api/hunch/[id]/start/route.test.ts'` — Expected: PASS.
Run: `npm run typecheck && npm run lint && npm test` — Expected: clean.

- [ ] **Step 5: Ready to commit**

Suggested message: `fix(start): put day 1 on the user's own date`

---

### Task 4: Belief, verdict and home read the user's own day

**Files:**
- Modify: `src/app/api/hunch/[id]/belief/route.ts:16, 66-69`
- Modify: `src/app/api/hunch/[id]/verdict/route.ts:117`
- Modify: `src/lib/home.ts:62-66, 90, 98`
- Test: `src/lib/home.test.ts`, `src/app/api/hunch/[id]/verdict/route.test.ts` (mock only)

**Interfaces:**
- Consumes: `localToday`, `userTimeZone` (Task 1)

- [ ] **Step 1: Write the failing test**

`src/lib/home.test.ts` — below the existing mocks add:

```ts
vi.mock("@/lib/zone", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/zone")>()),
  userTimeZone: vi.fn(async () => "UTC"),
}));
```

Add `import { userTimeZone } from "@/lib/zone";` and `afterEach` to the vitest import, then append:

```ts
describe("getHomeData on the user's own day", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // 20:00 PDT on 22 Sep — already 23 Sep in UTC.
    vi.setSystemTime(new Date("2026-09-23T03:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("counts days and looks up today's log by the user's date", async () => {
    vi.mocked(userTimeZone).mockResolvedValue("America/Los_Angeles");
    vi.mocked(db.hunch.findMany).mockResolvedValue([
      hunch({
        status: "running",
        protocol: {
          design,
          safetyState: "approved",
          startedAt: new Date("2026-09-20T00:00:00.000Z"),
        },
      }),
    ] as never);

    const data = await getHomeData("u1");

    // 20, 21, 22 Sep: day 3 in Los Angeles (UTC would say day 4).
    expect(data.today[0].progress).toEqual({ day: 3, total: 10 });
    const include = vi.mocked(db.hunch.findMany).mock.calls[0][0]!.include as {
      checkIns: { where: { loggedOn: Date } };
    };
    expect(include.checkIns.where.loggedOn.toISOString()).toBe("2026-09-22T00:00:00.000Z");
  });
});
```

If a running, loggable hunch is not grouped into `data.today` (check `isToday` in `home.ts`), read `progress` from whichever group it lands in; the assertion is about `progress`, not the grouping.

`src/app/api/hunch/[id]/verdict/route.test.ts` — below the existing mocks add the same `@/lib/zone` mock plus `vi.mock("server-only", () => ({}));`. No new test: the existing ones must keep passing with the route reading the zone.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/home.test.ts`
Expected: the new test FAILS — `day: 4`, and `loggedOn` is `2026-09-23`.

- [ ] **Step 3: Implement**

`src/lib/home.ts`: add `import { localToday, userTimeZone } from "@/lib/zone";`. Replace lines 63-66 (`const now = …` and `const today = new Date(Date.UTC(…))`) with:

```ts
  // The user's own calendar date. Every comparison below is date-only, so the
  // day key stands in for "now" as well.
  const today = localToday(await userTimeZone(userId));
```

Then replace `now` with `today` in `currentPhase(h.protocol.startedAt, design, now)` and in `utcDaysBetween(h.protocol.startedAt, now)`. Run `grep -n "\bnow\b" src/lib/home.ts` afterwards — expected: no hits inside `getHomeData`.

`src/app/api/hunch/[id]/belief/route.ts`: add `import { localToday, userTimeZone } from "@/lib/zone";` and change the schedule line to:

```ts
    schedule = currentPhase(
      hunch.protocol.startedAt,
      design,
      localToday(await userTimeZone(session.user.id)),
    );
```

`src/app/api/hunch/[id]/verdict/route.ts`: add the same import and change line 117 to:

```ts
  const schedule = currentPhase(
    hunch.protocol.startedAt,
    design,
    localToday(await userTimeZone(session.user.id)),
  );
```

(It sits after the stored-verdict early return, so a concluded hunch's reads pay no extra query.)

- [ ] **Step 4: Run to verify, then the whole suite**

Run: `npx vitest run src/lib/home.test.ts 'src/app/api/hunch/[id]/verdict/route.test.ts'` — Expected: PASS.
Run: `npm run typecheck && npm run lint && npm test` — Expected: clean; verdict and home test **files** both listed as passed.

- [ ] **Step 5: Ready to commit**

Suggested message: `fix(schedule): read the phase on the user's own day everywhere`

---

### Task 5: The client's "today" is the browser's date

**Files:**
- Modify: `src/components/adherence-strip.tsx:44`
- Modify: `src/components/check-in.tsx:463-471` (`startsIn`)

**Interfaces:**
- Consumes: `browserToday` (Task 1)

These two sites have no component tests today; `browserToday` itself is covered by Task 1. Verification is typecheck plus the live check in Step 3.

- [ ] **Step 1: Implement**

`adherence-strip.tsx`: add `import { browserToday } from "@/lib/browser-day";` and change the default prop `today = new Date(),` to `today = browserToday(),`.

`check-in.tsx`: add the same import and rewrite `startsIn`:

```ts
/** "tomorrow", "in 3 days" — how far off a scheduled start is. */
function startsIn(iso: string): string {
  const start = new Date(iso); // a UTC-midnight day key
  const days = Math.round((start.getTime() - browserToday().getTime()) / 86_400_000);
  return days <= 1 ? "tomorrow" : `in ${days} days`;
}
```

- [ ] **Step 2: Run the whole suite**

Run: `npm run typecheck && npm run lint && npm test` — Expected: clean.

- [ ] **Step 3: Live check**

`npm run dev` (Docker running). In Chrome DevTools → More tools → Sensors → Location, set the time zone override to `America/Los_Angeles`, reload a running hunch's dashboard, log a check-in. Then `select "timeZone" from "user"` for the signed-in user (via `npx prisma studio` or psql on the `hunch-db` container) — Expected: `America/Los_Angeles`. The adherence strip's "today" cell is the Los Angeles date. Reset the override and log again — the stored zone flips back.

- [ ] **Step 4: Ready to commit — end of PR 1**

Suggested message: `fix(ui): count days from the browser's own date`

Before opening PR 1, the owner confirms whether anyone is mid-trial: a running trial's `startedAt` is not rewritten, so for users far from UTC its schedule can shift by a day.

---

## Part 2 — the verdict sweep

Branch from PR 1 (or from main once it merges).

### Task 6: Extract `concludeTrial`

A pure move. No behaviour changes; the existing verdict route tests are the proof.

**Files:**
- Create: `src/lib/conclude-trial.ts`
- Modify: `src/app/api/hunch/[id]/verdict/route.ts`

**Interfaces:**
- Produces:
  - `VERDICT_INCLUDE` — the route's current `include` object, `as const satisfies Prisma.HunchInclude`
  - `type VerdictHunch = Prisma.HunchGetPayload<{ include: typeof VERDICT_INCLUDE }>`
  - `type VerdictRow = { category: string; narrative: string; pEffect: number; effect: number; ciLow: number; ciHigh: number; nA: number; nB: number; model: string }`
  - `type ConcludeResult = { ok: true; row: VerdictRow } | { ok: false; status: 409 | 500 | 502; error: string }`
  - `concludeTrial(hunch: VerdictHunch, userId: string, today: Date): Promise<ConcludeResult>`

- [ ] **Step 1: Record the baseline**

Run: `npx vitest run 'src/app/api/hunch/[id]/verdict/route.test.ts'` — note the passing count. It must be identical after Step 3.

- [ ] **Step 2: Create `src/lib/conclude-trial.ts`**

```ts
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { computeBelief } from "@/lib/bayes";
import { armRows, engineOutcomeType, pickExposure, pickPrimary } from "@/lib/parameters";
import { currentPhase } from "@/lib/schedule";
import { classifyVerdict } from "@/lib/verdict";
import { writeEdgeData } from "@/lib/memory/causal-graph";
import { runAnalysis } from "@/mastra/workflows/analysis";
import { parseStoredDesign } from "@/lib/schemas/protocol";

/** Everything concluding a trial reads. The verdict route loads the hunch with it too. */
export const VERDICT_INCLUDE = {
  hypothesis: true,
  protocol: true,
  verdict: true,
  parameters: true,
  checkIns: {
    orderBy: { loggedOn: "asc" },
    include: { values: { select: { parameterId: true, value: true } } },
  },
} as const satisfies Prisma.HunchInclude;

export type VerdictHunch = Prisma.HunchGetPayload<{ include: typeof VERDICT_INCLUDE }>;

/** The stored shape of a verdict — what `toDto` in the route reads. */
export type VerdictRow = {
  category: string; narrative: string; pEffect: number; effect: number;
  ciLow: number; ciHigh: number; nA: number; nB: number; model: string;
};

export type ConcludeResult =
  | { ok: true; row: VerdictRow }
  | { ok: false; status: 409 | 500 | 502; error: string };

/**
 * Freeze a finished trial's verdict: compute the belief, classify it, have the
 * Analyst narrate it, and persist the snapshot, the hunch's `concluded` status
 * and its causal edge in one transaction.
 *
 * Called by the verdict route on a first view, and by the nightly sweep ahead
 * of one. `today` is the user's own calendar date (`localToday`). Nothing is
 * persisted on failure, so either caller can simply try again.
 */
export async function concludeTrial(
  hunch: VerdictHunch,
  userId: string,
  today: Date,
): Promise<ConcludeResult> {
  if (!hunch.hypothesis) return { ok: false, status: 409, error: "This trial hasn't started." };
  const design = hunch.protocol
    ? parseStoredDesign(hunch.protocol.design, hunch.hypothesis.outcomeMetric)
    : null;
  if (!hunch.protocol?.startedAt || !design) {
    return { ok: false, status: 409, error: "This trial hasn't started." };
  }
  // A diary has one arm. The engine compares two, and inventing a contrast the
  // data does not contain would be fabricating a result.
  if (hunch.protocol.safetyState === "observe-only") {
    return {
      ok: false,
      status: 409,
      error: "This one is a log, not a trial — there's nothing to compare it against.",
    };
  }

  const primary = pickPrimary(hunch.parameters);
  const exposureParam = pickExposure(hunch.parameters);
  const outcomeType = engineOutcomeType(primary?.type ?? hunch.hypothesis.outcomeType);
  const belief = computeBelief(
    armRows(hunch.checkIns, primary?.id, { shape: design.shape, exposureId: exposureParam?.id ?? null }),
    outcomeType,
  );
  const schedule = currentPhase(hunch.protocol.startedAt, design, today);

  const category = classifyVerdict(belief, schedule);
  if (category === null) {
    return { ok: false, status: 409, error: "This trial is still running." };
  }

  let verdict;
  try {
    verdict = await runAnalysis({
      category,
      belief,
      statement: hunch.hypothesis.statement,
      outcomeMetric: hunch.hypothesis.outcomeMetric,
      observational: design.shape === "observational",
      exposureLabel: exposureParam?.label ?? null,
    });
  } catch {
    // The Analyst call (or its structured-output parse) failed. Nothing is
    // persisted, so the next attempt retries cleanly.
    return { ok: false, status: 502, error: "Could not generate your verdict. Please try again." };
  }

  const edgeInput = writeEdgeData({
    category: verdict.category,
    effect: verdict.effect,
    pEffect: verdict.pEffect,
    statement: hunch.hypothesis.statement,
    outcomeMetric: hunch.hypothesis.outcomeMetric,
    hunchId: hunch.id,
    userId,
    subject: hunch.hypothesis.subject,
  });

  const row: VerdictRow = {
    category: verdict.category,
    narrative: verdict.narrative,
    pEffect: verdict.pEffect,
    effect: verdict.effect,
    ciLow: verdict.ci[0],
    ciHigh: verdict.ci[1],
    nA: verdict.nA,
    nB: verdict.nB,
    model: verdict.model,
  };

  try {
    await db.$transaction([
      db.verdict.create({ data: { hunchId: hunch.id, ...row } }),
      db.hunch.update({ where: { id: hunch.id }, data: { status: "concluded" } }),
      ...(edgeInput ? [db.causalEdge.create({ data: edgeInput })] : []),
    ]);
  } catch {
    // A concurrent first-read won the race and already wrote the verdict (the
    // @@unique on hunchId rejects the second insert). Serve the stored one so
    // both callers see the same frozen verdict instead of an error.
    const existing = await db.verdict.findUnique({ where: { hunchId: hunch.id } });
    if (existing) return { ok: true, row: existing };
    return { ok: false, status: 500, error: "Could not save your verdict. Please try again." };
  }

  return { ok: true, row };
}
```

- [ ] **Step 3: Slim the route**

In `verdict/route.ts`:
- Replace the `include: { … }` object in `db.hunch.findFirst` with `include: VERDICT_INCLUDE`.
- Change `toDto`'s first parameter type to `VerdictRow`.
- Delete everything from `if (!hunch.protocol?.startedAt || !design) {` to the end of `readVerdict` and replace it with:

```ts
  const result = await concludeTrial(
    hunch,
    session.user.id,
    localToday(await userTimeZone(session.user.id)),
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ verdict: toDto(result.row, outcome, report) });
```

- Imports: add `import { concludeTrial, VERDICT_INCLUDE, type VerdictRow } from "@/lib/conclude-trial";`; delete those no longer used (`computeBelief`, `armRows`, `engineOutcomeType`, `currentPhase`, `classifyVerdict`, `writeEdgeData`, `runAnalysis`). ESLint's unused-import rule will list any you miss.

**Behaviour check before running tests.** The old fresh path returned `{ ...verdict, exposure: report }` straight from the Analyst's output; the new one returns `toDto(row, outcome, report)`. These differ only if the Analyst's output carries fields `toDto` doesn't, or if it lacks `outcome`. Read `verdictSchema` in `src/lib/schemas/verdict.ts` and what `runAnalysis` returns. If a verdict route test compares the fresh-path body exactly and now fails, the fix is in the route, not the test: return `{ verdict: { ...analystOutput, exposure: report } }` by having `ConcludeResult` also carry `fresh?: Verdict` for that path. A changed test is a changed behaviour; this task changes none.

- [ ] **Step 4: Run to verify nothing moved**

Run: `npx vitest run 'src/app/api/hunch/[id]/verdict/route.test.ts'` — Expected: the same count as Step 1, all passing.
Run: `npm run typecheck && npm run lint && npm test` — Expected: clean.

- [ ] **Step 5: Ready to commit**

Suggested message: `refactor(verdict): move concluding a trial out of the route`

---

### Task 7: The nightly sweep

**Files:**
- Create: `src/inngest/verdict-sweep.ts`, `src/inngest/verdict-sweep.test.ts`
- Modify: `src/inngest/functions.ts` (register)

**Interfaces:**
- Consumes: `concludeTrial`, `VERDICT_INCLUDE` (Task 6); `localToday` (Task 1); `currentPhase` (existing); `parseStoredDesign` (existing)
- Produces:
  - `isDueForVerdict(startedAt: Date, design: ProtocolDesign, timeZone: string, now: Date): boolean`
  - `type SweepStep = { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> }`
  - `runVerdictSweep(step: SweepStep, now?: Date): Promise<{ due: number; concluded: number; failed: number }>`
  - `verdictSweep` — the Inngest function, id `"verdict-sweep"`

- [ ] **Step 1: Write the failing tests**

`src/inngest/verdict-sweep.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: { hunch: { findMany: vi.fn(), findUnique: vi.fn() }, user: { findMany: vi.fn() } },
}));
// Mocked whole: the real module imports the Analyst, which this suite must never load.
vi.mock("@/lib/conclude-trial", () => ({ concludeTrial: vi.fn(), VERDICT_INCLUDE: {} }));
vi.mock("@/inngest/client", () => ({ inngest: { createFunction: vi.fn(() => ({})) } }));

import { isDueForVerdict, runVerdictSweep, type SweepStep } from "@/inngest/verdict-sweep";
import { db } from "@/lib/db";
import { concludeTrial } from "@/lib/conclude-trial";

// A 10-day trial starting 10 Sep: days 10..19 Sep, `done` from 20 Sep.
const design = {
  phases: [
    { label: "A", kind: "baseline", days: 5, name: "Baseline", action: "Log it." },
    { label: "B", kind: "intervention", days: 5, name: "Change", action: "Do it." },
  ],
  washoutDays: 0,
  controls: [],
  instructions: "Log once a day.",
};
const startedAt = new Date("2026-09-10T00:00:00.000Z");
const at = (iso: string) => new Date(iso);

describe("isDueForVerdict", () => {
  it("is not due on the last scheduled day", () => {
    expect(isDueForVerdict(startedAt, design as never, "UTC", at("2026-09-19T12:00:00Z"))).toBe(false);
  });

  it("is not due on the grace day after the end", () => {
    expect(isDueForVerdict(startedAt, design as never, "UTC", at("2026-09-20T12:00:00Z"))).toBe(false);
  });

  it("is due once the grace day has passed", () => {
    expect(isDueForVerdict(startedAt, design as never, "UTC", at("2026-09-21T00:15:00Z"))).toBe(true);
  });

  it("waits for the grace day to pass in Los Angeles, not in UTC", () => {
    // 00:15Z on the 21st is 17:15 on the 20th in PDT — still the grace day there.
    expect(
      isDueForVerdict(startedAt, design as never, "America/Los_Angeles", at("2026-09-21T00:15:00Z")),
    ).toBe(false);
  });

  it("is due earlier in Kolkata, where the 21st has already begun", () => {
    // 20:00Z on the 20th is 01:30 on the 21st in IST.
    expect(isDueForVerdict(startedAt, design as never, "Asia/Kolkata", at("2026-09-20T20:00:00Z"))).toBe(true);
  });
});

/** Runs each step inline, like Inngest does on first execution. */
const step: SweepStep = { run: async (_id, fn) => fn() };

const candidate = (id: string) => ({
  id,
  userId: `u-${id}`,
  hypothesis: { outcomeMetric: "sleep" },
  protocol: { startedAt, design },
});
const zones = (...pairs: [string, string][]) =>
  vi.mocked(db.user.findMany).mockResolvedValue(
    pairs.map(([id, timeZone]) => ({ id, timeZone })) as never,
  );
const loaded = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  userId: `u-${id}`,
  status: "running",
  archivedAt: null,
  verdict: null,
  ...over,
});

describe("runVerdictSweep", () => {
  const now = at("2026-09-21T00:15:00Z");

  beforeEach(() => vi.clearAllMocks());

  it("concludes every due hunch and skips one still in its grace day", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([candidate("h1"), candidate("h2")] as never);
    zones(["u-h1", "UTC"], ["u-h2", "America/Los_Angeles"]);
    vi.mocked(db.hunch.findUnique).mockImplementation((async (args: { where: { id: string } }) =>
      loaded(args.where.id)) as never);
    vi.mocked(concludeTrial).mockResolvedValue({ ok: true, row: {} as never });

    expect(await runVerdictSweep(step, now)).toEqual({ due: 1, concluded: 1, failed: 0 });
    expect(concludeTrial).toHaveBeenCalledTimes(1);
    expect(vi.mocked(concludeTrial).mock.calls[0][1]).toBe("u-h1");
  });

  it("counts a failure and still concludes the next hunch", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([candidate("h1"), candidate("h2")] as never);
    zones(["u-h1", "UTC"], ["u-h2", "UTC"]);
    vi.mocked(db.hunch.findUnique).mockImplementation((async (args: { where: { id: string } }) =>
      loaded(args.where.id)) as never);
    vi.mocked(concludeTrial)
      .mockResolvedValueOnce({ ok: false, status: 502, error: "Analyst down" })
      .mockResolvedValueOnce({ ok: true, row: {} as never });

    expect(await runVerdictSweep(step, now)).toEqual({ due: 2, concluded: 1, failed: 1 });
  });

  it("skips a hunch that gained a verdict, or was archived, before its step ran", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([candidate("h1"), candidate("h2")] as never);
    zones(["u-h1", "UTC"], ["u-h2", "UTC"]);
    vi.mocked(db.hunch.findUnique)
      .mockResolvedValueOnce(loaded("h1", { verdict: { id: "v1" } }) as never)
      .mockResolvedValueOnce(loaded("h2", { archivedAt: new Date() }) as never);

    expect(await runVerdictSweep(step, now)).toEqual({ due: 2, concluded: 0, failed: 0 });
    expect(concludeTrial).not.toHaveBeenCalled();
  });

  it("asks the database only for live, unconcluded, runnable trials", async () => {
    vi.mocked(db.hunch.findMany).mockResolvedValue([] as never);
    zones();
    await runVerdictSweep(step, now);
    expect(vi.mocked(db.hunch.findMany).mock.calls[0][0]!.where).toEqual({
      status: "running",
      archivedAt: null,
      verdict: null,
      protocol: { startedAt: { not: null }, safetyState: { not: "observe-only" } },
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/inngest/verdict-sweep.test.ts`
Expected: FAIL — `Failed to resolve import "@/inngest/verdict-sweep"`.

- [ ] **Step 3: Implement**

`Hunch` has `userId` but no `user` relation (`prisma/schema.prisma`), and adding one would be a migration — so `find-due` reads the zones in a second query.

`src/inngest/verdict-sweep.ts`:

```ts
import "server-only";

import { inngest } from "@/inngest/client";
import { db } from "@/lib/db";
import { concludeTrial, VERDICT_INCLUDE } from "@/lib/conclude-trial";
import { currentPhase } from "@/lib/schedule";
import { parseStoredDesign, type ProtocolDesign } from "@/lib/schemas/protocol";
import { localToday } from "@/lib/zone";

/**
 * Freeze verdicts before anyone asks for them.
 *
 * The first view of a finished trial used to wait ~4s on the Analyst. This
 * does that work overnight instead — but only once a full day has passed since
 * the schedule ended, in the user's own zone. Freezing a verdict makes the
 * hunch `concluded`, and a concluded hunch refuses check-ins, so concluding the
 * moment the schedule ends would take away filling in the last day the morning
 * after. A user who opens the hunch inside that grace day still gets the
 * inline compute, exactly as before.
 */

/** The schedule had already ended by yesterday, in the user's zone. */
export function isDueForVerdict(
  startedAt: Date,
  design: ProtocolDesign,
  timeZone: string,
  now: Date,
): boolean {
  const yesterday = new Date(localToday(timeZone, now).getTime() - 86_400_000);
  return currentPhase(startedAt, design, yesterday).done;
}

/** The slice of Inngest's `step` the sweep uses — narrow so tests can pass a fake. */
export type SweepStep = { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };

export async function runVerdictSweep(
  step: SweepStep,
  now: Date = new Date(),
): Promise<{ due: number; concluded: number; failed: number }> {
  const due = await step.run("find-due", async () => {
    const hunches = await db.hunch.findMany({
      where: {
        status: "running",
        archivedAt: null,
        verdict: null,
        protocol: { startedAt: { not: null }, safetyState: { not: "observe-only" } },
      },
      select: {
        id: true,
        userId: true,
        hypothesis: { select: { outcomeMetric: true } },
        protocol: { select: { startedAt: true, design: true } },
      },
    });
    const zones = new Map(
      (
        await db.user.findMany({
          where: { id: { in: [...new Set(hunches.map((h) => h.userId))] } },
          select: { id: true, timeZone: true },
        })
      ).map((u) => [u.id, u.timeZone]),
    );
    return hunches
      .filter((h) => {
        if (!h.protocol?.startedAt) return false;
        const design = parseStoredDesign(h.protocol.design, h.hypothesis?.outcomeMetric);
        return isDueForVerdict(h.protocol.startedAt, design, zones.get(h.userId) ?? "UTC", now);
      })
      .map((h) => ({ id: h.id, timeZone: zones.get(h.userId) ?? "UTC" }));
  });

  let concluded = 0;
  let failed = 0;
  for (const { id, timeZone } of due) {
    try {
      const outcome = await step.run(`conclude-${id}`, async () => {
        // Re-read: between the sweep and this step the user may have opened the
        // verdict (which freezes it) or archived the hunch.
        const hunch = await db.hunch.findUnique({ where: { id }, include: VERDICT_INCLUDE });
        if (!hunch || hunch.verdict || hunch.status !== "running" || hunch.archivedAt) {
          return "skipped" as const;
        }
        const result = await concludeTrial(hunch, hunch.userId, localToday(timeZone, now));
        // Throwing makes Inngest retry this step alone.
        if (!result.ok) throw new Error(`conclude ${id}: ${result.status} ${result.error}`);
        return "concluded" as const;
      });
      if (outcome === "concluded") concluded++;
    } catch {
      // Out of retries. Tomorrow's sweep tries again, and a first view still
      // computes inline in the meantime.
      failed++;
    }
  }

  return { due: due.length, concluded, failed };
}

export const verdictSweep = inngest.createFunction(
  {
    id: "verdict-sweep",
    name: "Freeze the verdicts of finished trials",
    triggers: [{ cron: "15 0 * * *" }],
  },
  async ({ step }) => runVerdictSweep(step),
);
```

If TypeScript rejects `runVerdictSweep(step)` in `createFunction` because Inngest's `step.run` return type (`Jsonify<T>`) doesn't match `SweepStep`, cast at the boundary: `runVerdictSweep(step as unknown as SweepStep)`. Every value the sweep passes across a step is a plain string or `{ id, timeZone }`, so JSON round-tripping changes nothing.

In `src/inngest/functions.ts`: add `import { verdictSweep } from "@/inngest/verdict-sweep";` and change the last line to `export const functions = [reminderSweep, sendReminder, verdictSweep];`.

- [ ] **Step 4: Run to verify they pass, then the whole suite**

Run: `npx vitest run src/inngest/verdict-sweep.test.ts` — Expected: PASS (9 tests).
Run: `npm run typecheck && npm run lint && npm test` — Expected: clean, no failed files.

- [ ] **Step 5: Ready to commit**

Suggested message: `perf(verdict): freeze finished trials' verdicts overnight`

---

### Task 8: Live verification

No code. Needs Docker, the dev server, and OpenRouter credit (one Analyst call per hunch).

- [ ] **Step 1: Make a hunch due**

With `npm run dev` running and a running phased hunch in the DB, move its anchor back so the schedule ended two days ago:

```sql
update "Protocol" set "startedAt" = (current_date - interval '1 day' * (<total days> + 2))
where "hunchId" = '<id>';
```

(`<total days>` = sum of phase days + washout days × (phases − 1); read `design` for the hunch.)

- [ ] **Step 2: Run the sweep**

`npx --ignore-scripts=false inngest-cli@latest dev -u http://localhost:3000/api/inngest` (with `INNGEST_DEV=1` in `.env`), then at http://localhost:8288 → GraphQL:

```graphql
mutation { invokeFunction(data: {}, functionSlug: "hunch-verdict-sweep") }
```

Expected: the run returns `{ due: 1, concluded: 1, failed: 0 }`; the hunch's `status` is `concluded`; a `Verdict` row exists.

- [ ] **Step 3: Read it**

Open the hunch. Expected: the verdict renders at once, and `Server-Timing` on `GET /api/hunch/<id>/verdict` shows `db-load` only (no Analyst wait).

- [ ] **Step 4: Grace**

Repeat Step 1 with `+ 1` instead of `+ 2` (ended yesterday). Run the sweep. Expected: `{ due: 0, … }`, and the hunch still accepts a check-in for its last day.

- [ ] **Step 5: Record**

Append the observed run outputs to this plan under "Results", then report ready to commit: `docs(plan): record what the verdict sweep did live`.

## Results

(Filled in by Task 8.)
