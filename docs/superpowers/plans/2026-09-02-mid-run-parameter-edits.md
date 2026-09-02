# Mid-Run Parameter Edits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let someone mid-trial start tracking something new, and stop tracking something that turned out to be noise, without ever touching the measure their verdict depends on.

**Architecture:** Retirement is a timestamp, never a delete — readings hang off parameters by a cascading key, so deleting a row would take a trial's history with it. Two narrow routes replace the blanket "no edits once started" guard; the primary stays frozen by an explicit refusal rather than by the absence of a route.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7 (custom client at `src/generated/prisma`), PostgreSQL, Zod 4, Vitest 4, shadcn on Base UI.

**Spec:** `docs/superpowers/specs/2026-09-02-parameters-and-safety-design.md` §5.

## Global Constraints

- **The primary never changes mid-run.** Not its label, not its kind, and it can never be retired. Changing what you are measuring halfway is what makes a result meaningless. Every route enforces this itself; it is not left to the UI.
- **Retirement is never a delete.** `Parameter` rows and their `CheckInValue` children survive forever. `onDelete: Cascade` means a delete would silently take logged days with it.
- **The engine is untouched.** `primaryBeliefRows` reads only the primary, so adding or retiring a tracker cannot move a verdict. No file under `src/lib/bayes` changes.
- **Export keeps retired parameters.** A column that stops halfway is the honest record; dropping it would rewrite history.
- **No commit trailers.** Never add `Co-Authored-By` or `Generated with` to any commit or PR in this repo.
- **Prisma is custom-output.** After any schema change: `npx prisma generate`, delete `.next`, restart dev. Import from `@/generated/prisma/client`.
- **Vitest collects `src/**/*.test.ts` only.** `.tsx` is not collected — component behaviour is proven through the pure helpers it calls, and by looking at it.
- **Copy carries no valence and gives no advice.** Retiring a tracker is a filing decision, not a judgement about the data.

## The decision worth arguing about

**A retired parameter accepts no new readings at all — including backfilled corrections for days before it was retired.**

The alternative is to accept a correction when `loggedOn` falls before `retiredAt`. That is more faithful, and it costs a per-day notion of which parameters were active, in the correction form, in the check-in route, and in anything that later renders a day. For a tracker the user has explicitly stopped caring about, that is a large amount of machinery for a rare case with an obvious workaround: don't retire it yet.

If this turns out to be wrong, the fix is a date comparison in one route and one component, and `retiredAt` already carries the date it needs.

---

### Task 1: Retirement is a timestamp

**Files:**
- Modify: `prisma/schema.prisma` (the `Parameter` model)
- Create: `prisma/migrations/<timestamp>_parameter_retired_at/migration.sql` (generated)
- Modify: `src/lib/parameters.ts` (`ParameterRow`, `toParameterDto`, new `activeParameters`)
- Modify: `src/lib/schemas/parameter.ts` (`parameterSchema` carries `retired`)
- Test: `src/lib/parameters.test.ts`

**Interfaces:**
- Consumes: `ParameterRow`, `toParameterDto` as they stand.
- Produces: `activeParameters<T extends { retiredAt: Date | null }>(rows: T[]): T[]`; `toParameterDto` gains `retired: boolean`; `ParameterRow` gains `retiredAt: Date | null`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/parameters.test.ts`:

```ts
describe("activeParameters", () => {
  const rows = [
    { id: "p1", retiredAt: null },
    { id: "p2", retiredAt: new Date("2026-09-01T00:00:00.000Z") },
    { id: "p3", retiredAt: null },
  ];

  test("drops the retired ones and keeps order", () => {
    expect(activeParameters(rows).map((r) => r.id)).toEqual(["p1", "p3"]);
  });

  test("returns everything when nothing is retired", () => {
    expect(activeParameters([{ id: "p1", retiredAt: null }])).toHaveLength(1);
  });
});

describe("toParameterDto retirement", () => {
  const base = {
    id: "p1", label: "Stress", type: "scale", unit: "1-5",
    min: 1, max: 5, isPrimary: false, sortOrder: 1,
  };

  test("reports a live parameter as not retired", () => {
    expect(toParameterDto({ ...base, retiredAt: null }).retired).toBe(false);
  });

  test("reports a retired parameter as retired", () => {
    const dto = toParameterDto({ ...base, retiredAt: new Date("2026-09-01T00:00:00.000Z") });
    expect(dto.retired).toBe(true);
  });

  test("sends a boolean, not a date — the client only ever asks whether", () => {
    const dto = toParameterDto({ ...base, retiredAt: new Date() });
    expect(typeof dto.retired).toBe("boolean");
  });
});
```

Add `activeParameters` to the file's import from `@/lib/parameters`.

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/parameters.test.ts`
Expected: FAIL — `activeParameters is not a function`, and `retired` is undefined.

- [ ] **Step 3: Add the column**

In `prisma/schema.prisma`, inside `model Parameter`, after `sortOrder`:

```prisma
  /// When the user stopped logging this tracker. Never a delete: readings
  /// cascade off this row, so removing it would take the trial's history with
  /// it. Null means live.
  retiredAt DateTime?
```

Then:

```bash
npm run db:up
npx prisma migrate dev --name parameter_retired_at
npx prisma generate
rm -rf .next
```

- [ ] **Step 4: Carry it through the DTO**

In `src/lib/schemas/parameter.ts`, extend `parameterSchema`:

```ts
export const parameterSchema = parameterDraftSchema.extend({
  id: z.string().min(1),
  sortOrder: z.number().int().min(0),
  /** The user stopped logging this one. Its history stays; the check-in
   *  stops asking. Absent on payloads written before retirement existed. */
  retired: z.boolean().default(false),
});
```

In `src/lib/parameters.ts`, add `retiredAt: Date | null;` to `ParameterRow`, add `retired: row.retiredAt !== null,` to `toParameterDto`, and add:

```ts
/**
 * The parameters still being logged. Retired rows stay in the database and in
 * the export — a column that stops halfway is the honest record — but nothing
 * asks the user for them again.
 */
export function activeParameters<T extends { retiredAt: Date | null }>(rows: T[]): T[] {
  return rows.filter((r) => r.retiredAt === null);
}
```

- [ ] **Step 5: Run them and watch them pass**

Run: `npx vitest run src/lib/parameters.test.ts && npx tsc --noEmit`
Expected: PASS, and the compiler names every reader that must now supply `retiredAt`. Fix those by selecting the column, not by casting.

- [ ] **Step 6: Prove the tests bite**

Change `r.retiredAt === null` to `r.retiredAt !== null`, re-run, confirm "drops the retired ones" fails. Put it back.

- [ ] **Step 7: Commit**

```bash
git add prisma src/lib/parameters.ts src/lib/parameters.test.ts src/lib/schemas/parameter.ts
git commit -m "feat(parameters): retirement is a timestamp, never a delete"
```

---

### Task 2: Stop asking for retired trackers

**Files:**
- Modify: `src/app/api/hunch/[id]/belief/route.ts:53` (what the dashboard renders)
- Modify: `src/app/api/hunch/[id]/checkin/route.ts:53-66` (what the server accepts)
- Modify: `src/app/api/hunch/[id]/export/route.ts` — **verify only, must not filter**
- Test: `src/app/api/hunch/[id]/checkin/route.test.ts`

**Interfaces:**
- Consumes: `activeParameters` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Write the failing route test**

In `src/app/api/hunch/[id]/checkin/route.test.ts`, add `retiredAt: null` to the existing parameter fixtures, then append a case:

```ts
it("refuses a reading for a retired tracker, and writes nothing", async () => {
  vi.mocked(db.hunch.findFirst).mockResolvedValue({
    ...runningHunch,
    parameters: [
      { id: "p1", label: "hours of sleep", type: "amount", min: null, max: null, isPrimary: true, retiredAt: null },
      { id: "p2", label: "stress", type: "scale", min: 1, max: 5, isPrimary: false, retiredAt: new Date("2026-09-01T00:00:00.000Z") },
    ],
  } as never);

  const res = await POST(
    req({ values: [{ parameterId: "p1", value: 7 }, { parameterId: "p2", value: 3 }] }),
    params,
  );

  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: "You stopped tracking stress." });
  // Validation happens before any write, so a rejected day leaves no rows.
  expect(db.$transaction).not.toHaveBeenCalled();
});
```

Match `runningHunch`, `req` and `params` to whatever the file already names them.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run "src/app/api/hunch/[id]/checkin/route.test.ts"`
Expected: FAIL with 201 — a retired parameter is currently accepted like any other.

- [ ] **Step 3: Refuse it in the route**

In `src/app/api/hunch/[id]/checkin/route.ts`, inside the validation loop, directly after the `if (!param)` check:

```ts
    // Retired means the user chose to stop logging this. Accepting a late
    // reading for it — even a backfill for a day before they retired it —
    // would need a per-day notion of which parameters were live, in the route
    // and in every screen that renders a day. If they want it back, they
    // un-retire it.
    if (param.retiredAt !== null) {
      return NextResponse.json(
        { error: `You stopped tracking ${param.label}.` },
        { status: 400 },
      );
    }
```

- [ ] **Step 4: Stop offering them**

In `src/app/api/hunch/[id]/belief/route.ts:53`:

```ts
    parameters: activeParameters(hunch.parameters).map(toParameterDto),
```

Import `activeParameters` from `@/lib/parameters`.

**Leave `src/app/api/hunch/[id]/export/route.ts` alone.** The export is the record, and a tracker that ran for nine days then stopped belongs in it. Confirm with `grep -n activeParameters "src/app/api/hunch/[id]/export/route.ts"` returning nothing.

- [ ] **Step 5: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/hunch/[id]" && git commit -m "feat(check-in): stop asking for retired trackers"
```

---

### Task 3: Add a tracker mid-run

**Files:**
- Create: `src/app/api/hunch/[id]/parameters/route.ts`
- Create: `src/app/api/hunch/[id]/parameters/route.test.ts`
- Modify: `src/lib/schemas/parameter.ts` (add `trackerAddSchema`, `MAX_ACTIVE_PARAMETERS`)

**Interfaces:**
- Consumes: `trackerSchema`, `activeParameters`, `toParameterDto`.
- Produces: `POST /api/hunch/[id]/parameters` → `201 { parameter }`; `MAX_ACTIVE_PARAMETERS = 5`.

- [ ] **Step 1: Add the input schema**

In `src/lib/schemas/parameter.ts`:

```ts
/** One primary plus four trackers. Retired rows don't count — they aren't
 *  being logged, and they still hold history. */
export const MAX_ACTIVE_PARAMETERS = 5;

/** A tracker added to a trial already under way. Never primary: a running
 *  trial already has one, and it is frozen. */
export const trackerAddSchema = trackerSchema;
```

- [ ] **Step 2: Write the failing route tests**

Create `src/app/api/hunch/[id]/parameters/route.test.ts`:

```ts
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/hunch/[id]/parameters/route";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

vi.mock("@/lib/db", () => ({
  db: { hunch: { findFirst: vi.fn() }, parameter: { create: vi.fn() } },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

const params = Promise.resolve({ id: "h1" });
const req = (body: unknown) =>
  new NextRequest("http://localhost/api/hunch/h1/parameters", {
    method: "POST",
    body: JSON.stringify(body),
  });

const running = {
  id: "h1",
  userId: "u1",
  protocol: { startedAt: new Date("2026-08-01T00:00:00.000Z") },
  parameters: [
    { id: "p1", label: "sleep", isPrimary: true, retiredAt: null, sortOrder: 0 },
    { id: "p2", label: "stress", isPrimary: false, retiredAt: null, sortOrder: 1 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ user: { id: "u1" } } as never);
  vi.mocked(db.hunch.findFirst).mockResolvedValue(running as never);
  vi.mocked(db.parameter.create).mockImplementation(
    (async ({ data }: { data: Record<string, unknown> }) => ({
      id: "p3", unit: null, min: null, max: null, retiredAt: null, ...data,
    })) as never,
  );
});

describe("POST /api/hunch/[id]/parameters", () => {
  it("adds a tracker after the existing rows", async () => {
    const res = await POST(req({ label: "Coffees", type: "count" }), { params });
    expect(res.status).toBe(201);
    const arg = vi.mocked(db.parameter.create).mock.calls[0][0] as {
      data: { sortOrder: number; isPrimary: boolean; hunchId: string };
    };
    expect(arg.data).toMatchObject({ hunchId: "h1", isPrimary: false, sortOrder: 2 });
  });

  it("never lets a new row claim primary, whatever the payload says", async () => {
    await POST(req({ label: "Coffees", type: "count", isPrimary: true }), { params });
    const arg = vi.mocked(db.parameter.create).mock.calls[0][0] as {
      data: { isPrimary: boolean };
    };
    expect(arg.data.isPrimary).toBe(false);
  });

  it("refuses once five are already active", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...running,
      parameters: Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`, label: `p${i}`, isPrimary: i === 0, retiredAt: null, sortOrder: i,
      })),
    } as never);
    const res = await POST(req({ label: "One more", type: "count" }), { params });
    expect(res.status).toBe(409);
    expect(db.parameter.create).not.toHaveBeenCalled();
  });

  it("counts retired rows against nothing", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...running,
      parameters: [
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `r${i}`, label: `r${i}`, isPrimary: false, retiredAt: new Date(), sortOrder: i,
        })),
        { id: "p1", label: "sleep", isPrimary: true, retiredAt: null, sortOrder: 5 },
      ],
    } as never);
    const res = await POST(req({ label: "Coffees", type: "count" }), { params });
    expect(res.status).toBe(201);
  });

  it("refuses before the trial has started — redesign is the path then", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({
      ...running,
      protocol: { startedAt: null },
    } as never);
    const res = await POST(req({ label: "Coffees", type: "count" }), { params });
    expect(res.status).toBe(409);
  });

  it("404s a hunch that isn't theirs", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(null as never);
    const res = await POST(req({ label: "Coffees", type: "count" }), { params });
    expect(res.status).toBe(404);
  });

  it("400s an unusable payload", async () => {
    const res = await POST(req({ label: "", type: "count" }), { params });
    expect(res.status).toBe(400);
  });

  it("401s without a session", async () => {
    vi.mocked(getSession).mockResolvedValue(null as never);
    const res = await POST(req({ label: "Coffees", type: "count" }), { params });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npx vitest run "src/app/api/hunch/[id]/parameters/route.test.ts"`
Expected: FAIL — the module does not exist.

- [ ] **Step 4: Write the route**

Create `src/app/api/hunch/[id]/parameters/route.ts`:

```ts
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { activeParameters, toParameterDto } from "@/lib/parameters";
import { MAX_ACTIVE_PARAMETERS, trackerAddSchema } from "@/lib/schemas/parameter";

/**
 * Add a tracker to a trial already under way.
 *
 * Adding is safe in a way that redesigning is not: a new row starts empty, the
 * days before it are legitimately blank, and the engine reads only the primary
 * — so nothing about the verdict moves. What the design route refuses, and this
 * one must keep refusing, is touching the measure the verdict is built on.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: { protocol: true, parameters: true },
  });
  if (!hunch) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }
  if (!hunch.protocol?.startedAt) {
    return NextResponse.json(
      { error: "This trial hasn't started — change the plan instead." },
      { status: 409 },
    );
  }

  const parsed = trackerAddSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Give it a name and say how you'll log it." }, { status: 400 });
  }

  const active = activeParameters(hunch.parameters);
  if (active.length >= MAX_ACTIVE_PARAMETERS) {
    return NextResponse.json(
      { error: "You're already tracking five things. Retire one first." },
      { status: 409 },
    );
  }

  const parameter = await db.parameter.create({
    data: {
      hunchId: hunch.id,
      label: parsed.data.label,
      type: parsed.data.type,
      unit: parsed.data.unit ?? null,
      min: parsed.data.min ?? null,
      max: parsed.data.max ?? null,
      // Never from the payload. A running trial has its primary, and it is frozen.
      isPrimary: false,
      sortOrder: hunch.parameters.length,
    },
  });

  return NextResponse.json({ parameter: toParameterDto(parameter) }, { status: 201 });
}
```

- [ ] **Step 5: Run them and watch them pass**

Run: `npx vitest run "src/app/api/hunch/[id]/parameters/route.test.ts"`
Expected: PASS, 8 tests.

- [ ] **Step 6: Prove they bite**

Change `isPrimary: false` to `isPrimary: parsed.data.isPrimary ?? false` (and widen the schema enough to compile). Confirm "never lets a new row claim primary" fails. Put it back.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/hunch/[id]/parameters" src/lib/schemas/parameter.ts
git commit -m "feat(parameters): add a tracker to a running trial"
```

---

### Task 4: Retire a tracker

**Files:**
- Create: `src/app/api/hunch/[id]/parameters/[parameterId]/route.ts`
- Create: `src/app/api/hunch/[id]/parameters/[parameterId]/route.test.ts`

**Interfaces:**
- Consumes: `toParameterDto`.
- Produces: `PATCH /api/hunch/[id]/parameters/[parameterId]` taking `{ retired: boolean }` → `200 { parameter }`.

A PATCH rather than a DELETE, deliberately: nothing is deleted, and the same call un-retires.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/hunch/[id]/parameters/[parameterId]/route.test.ts`:

```ts
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/hunch/[id]/parameters/[parameterId]/route";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

vi.mock("@/lib/db", () => ({
  db: { parameter: { findFirst: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

const params = Promise.resolve({ id: "h1", parameterId: "p2" });
const req = (body: unknown) =>
  new NextRequest("http://localhost/api/hunch/h1/parameters/p2", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

const tracker = {
  id: "p2", hunchId: "h1", label: "stress", type: "scale", unit: "1-5",
  min: 1, max: 5, isPrimary: false, sortOrder: 1, retiredAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue({ user: { id: "u1" } } as never);
  vi.mocked(db.parameter.findFirst).mockResolvedValue(tracker as never);
  vi.mocked(db.parameter.update).mockImplementation(
    (async ({ data }: { data: Record<string, unknown> }) => ({ ...tracker, ...data })) as never,
  );
});

describe("PATCH /api/hunch/[id]/parameters/[parameterId]", () => {
  it("retires a tracker by stamping a date, never deleting it", async () => {
    const res = await PATCH(req({ retired: true }), { params });
    expect(res.status).toBe(200);
    const arg = vi.mocked(db.parameter.update).mock.calls[0][0] as {
      data: { retiredAt: Date | null };
    };
    expect(arg.data.retiredAt).toBeInstanceOf(Date);
    expect(await res.json()).toMatchObject({ parameter: { retired: true } });
  });

  it("un-retires by clearing the date", async () => {
    vi.mocked(db.parameter.findFirst).mockResolvedValue({
      ...tracker, retiredAt: new Date("2026-09-01T00:00:00.000Z"),
    } as never);
    const res = await PATCH(req({ retired: false }), { params });
    expect(res.status).toBe(200);
    const arg = vi.mocked(db.parameter.update).mock.calls[0][0] as {
      data: { retiredAt: Date | null };
    };
    expect(arg.data.retiredAt).toBeNull();
  });

  it("refuses to retire the primary — the verdict is built on it", async () => {
    vi.mocked(db.parameter.findFirst).mockResolvedValue({
      ...tracker, isPrimary: true,
    } as never);
    const res = await PATCH(req({ retired: true }), { params });
    expect(res.status).toBe(409);
    expect(db.parameter.update).not.toHaveBeenCalled();
  });

  it("404s a parameter that isn't on a hunch they own", async () => {
    vi.mocked(db.parameter.findFirst).mockResolvedValue(null as never);
    const res = await PATCH(req({ retired: true }), { params });
    expect(res.status).toBe(404);
  });

  it("400s a payload that doesn't say which way", async () => {
    const res = await PATCH(req({}), { params });
    expect(res.status).toBe(400);
  });

  it("401s without a session", async () => {
    vi.mocked(getSession).mockResolvedValue(null as never);
    const res = await PATCH(req({ retired: true }), { params });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run "src/app/api/hunch/[id]/parameters/[parameterId]/route.test.ts"`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the route**

Create `src/app/api/hunch/[id]/parameters/[parameterId]/route.ts`:

```ts
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { toParameterDto } from "@/lib/parameters";

const retireSchema = z.object({ retired: z.boolean() });

/**
 * Retire a tracker, or bring it back.
 *
 * PATCH and not DELETE, because nothing is deleted: `CheckInValue` cascades off
 * `Parameter`, so removing the row would take every reading of it with it, and
 * the export would quietly lose a column it once had. Retirement stamps a date
 * and the check-in stops asking.
 *
 * The primary is refused outright. It is the measure the verdict is computed
 * from, and a trial that stops logging it has no result — the UI hides the
 * control, and this refuses the request anyway.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; parameterId: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, parameterId } = await params;
  const parsed = retireSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Say whether to retire it or bring it back." }, { status: 400 });
  }

  // Ownership is checked through the hunch, so a guessed parameter id on
  // someone else's trial is a 404 like any other.
  const parameter = await db.parameter.findFirst({
    where: { id: parameterId, hunchId: id, hunch: { userId: session.user.id } },
  });
  if (!parameter) {
    return NextResponse.json({ error: "That isn't something this hunch tracks." }, { status: 404 });
  }
  if (parameter.isPrimary) {
    return NextResponse.json(
      { error: "This is the measure your result is built on — it has to keep running." },
      { status: 409 },
    );
  }

  const updated = await db.parameter.update({
    where: { id: parameter.id },
    data: { retiredAt: parsed.data.retired ? new Date() : null },
  });

  return NextResponse.json({ parameter: toParameterDto(updated) });
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `npx vitest run "src/app/api/hunch/[id]/parameters/[parameterId]/route.test.ts"`
Expected: PASS, 6 tests.

- [ ] **Step 5: Prove they bite**

Delete the `parameter.isPrimary` guard, re-run, confirm "refuses to retire the primary" fails. Put it back.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/hunch/[id]/parameters/[parameterId]"
git commit -m "feat(parameters): retire a tracker without losing its history"
```

---

### Task 5: The controls on the dashboard

**Files:**
- Create: `src/hooks/use-parameter-edits.ts`
- Create: `src/components/hunch/tracker-editor.tsx`
- Modify: `src/components/hunch/hunch-dashboard.tsx`
- Test: none — `.tsx` is not collected; the rules are already tested in Tasks 3 and 4.

**Interfaces:**
- Consumes: both routes; `Parameter` from `@/lib/schemas/parameter`; `useBelief`'s query key for invalidation.
- Produces: `useAddTracker(hunchId)`, `useRetireTracker(hunchId)`, `<TrackerEditor hunchId parameters />`.

- [ ] **Step 1: Write the mutations**

Create `src/hooks/use-parameter-edits.ts`, following the shape of `src/hooks/use-checkin.ts` (same query client, same error handling, same invalidation of `["belief", hunchId]` so the check-in re-renders with the new set).

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Parameter, ParameterType } from "@/lib/schemas/parameter";

async function send(url: string, method: "POST" | "PATCH", body: unknown): Promise<Parameter> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? "That didn't save.");
  return data.parameter as Parameter;
}

/** Add a tracker to a running trial. */
export function useAddTracker(hunchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { label: string; type: ParameterType; unit?: string; min?: number; max?: number }) =>
      send(`/api/hunch/${hunchId}/parameters`, "POST", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["belief", hunchId] }),
  });
}

/** Retire a tracker, or bring it back. */
export function useRetireTracker(hunchId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { parameterId: string; retired: boolean }) =>
      send(`/api/hunch/${hunchId}/parameters/${input.parameterId}`, "PATCH", { retired: input.retired }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["belief", hunchId] }),
  });
}
```

Check the real query key in `src/hooks/use-belief.ts` and match it exactly — a wrong key means the check-in silently keeps the old set until a reload.

- [ ] **Step 2: Build the editor**

Create `src/components/hunch/tracker-editor.tsx`. Requirements, in the app's existing idiom (`Button variant="brand" size="touch"`, `Input`, the `LABEL` eyebrow style, `ToggleGroup` for the kind picker exactly as `parameter-editor.tsx` uses it):

- Lists the non-primary parameters with a **Stop tracking** button each.
- Renders **no control at all** for the primary — with a one-line note that it runs for the whole trial.
- A collapsed **Track something else** control that opens a label field plus the four-kind picker, and is hidden entirely once five are active.
- Server errors shown as text next to the control that caused them, never a toast that disappears — the 409s here explain a rule, and the rule is what the user needs to read.
- Reuse `useConfirmPanel` (`src/hooks/use-confirm-panel.ts`) for the stop-tracking confirmation, so focus and Escape behave like Archive and Abandon already do.

Copy, which must state a consequence rather than a judgement:

> **Stop tracking stress?**
> The days you've already logged stay in your results and your export. You just won't be asked for it again.
> `[ Stop tracking ]` `[ Keep it ]`

- [ ] **Step 3: Put it on the dashboard**

In `src/components/hunch/hunch-dashboard.tsx`, render `<TrackerEditor hunchId={id} parameters={parameters} />` below the check-in, and only while the trial is running — a concluded trial's set is history, not something to edit.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: clean and green.

- [ ] **Step 5: See it in the browser**

Against a running hunch:

1. Add a tracker. It appears on the check-in immediately, without a reload. Log a value for it and confirm it saves.
2. Retire it. It disappears from the check-in; `GET /api/hunch/<id>/export?format=csv` still has its column and its logged day.
3. Confirm the primary has no stop-tracking control, and that
   `curl -X PATCH .../parameters/<primaryId> -d '{"retired":true}'` answers 409 regardless.
4. Add until five are active and confirm the add control disappears rather than erroring.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/use-parameter-edits.ts src/components/hunch/tracker-editor.tsx src/components/hunch/hunch-dashboard.tsx
git commit -m "feat(dashboard): add and retire trackers mid-trial"
```

---

## Done when

- A running trial can gain a tracker and lose one, without a redesign.
- The primary cannot be retired — by the route, not only by the UI.
- A retired tracker vanishes from the check-in and stays in the export.
- No `Parameter` row is ever deleted by any of this.
- `npm test` green, `tsc --noEmit` and `eslint` clean.

## Not in this plan

- **Editing a tracker's label or kind mid-run.** Readings already logged under the old meaning would silently change meaning. Retire and add instead, which leaves both stretches legible.
- **Backfilling a retired tracker** — see "The decision worth arguing about".
- Everything in spec §2, §3 and §4, each of which wants its own plan.
