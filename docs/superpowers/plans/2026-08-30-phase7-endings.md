# Phase 07 — Endings and Edges — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a concluded experiment somewhere to go — repeat it, follow it up, archive it, export it — and make sure no route in the app can render an unbranded white page or a tab called "Hunch".

**Architecture:** Three independent seams. (1) A nullable `archivedAt` on `Hunch` plus two new API routes — `POST /api/hunch/[id]/archive` and `POST /api/hunch/[id]/repeat` — with a `VerdictActions` block rendered under the verdict narrative. (2) A pure formatter in `src/lib/export.ts` behind a thin `GET /api/hunch/[id]/export` route that returns a download attachment. (3) App Router boundary files (`error.tsx`, `not-found.tsx`, `loading.tsx`) built on one shared `Boundary` component, and server page wrappers exporting `generateMetadata` so the three client screens get real titles.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7 (custom client output at `src/generated/prisma`), PostgreSQL, TanStack Query 5, Tailwind v4 semantic tokens, Base UI / shadcn primitives, Vitest (node environment).

**Spec:** Repair-schedule artifact, phase 07 — https://claude.ai/code/artifact/a055d065-54d0-4286-af0c-2e3ec62d75c3
Interface audit (the four findings this closes) — https://claude.ai/code/artifact/5e6b0f0f-82bf-4225-b61f-268453a821ad

Phase 07 ships, verbatim from the spec:

- Three actions under the verdict narrative: Run it again · Test a follow-up (seeds `/hunch/new` from this result) · Archive.
- Link the verdict back to the protocol that produced it. Export as text or CSV.
- Themed boundaries — root `error.tsx` and `not-found.tsx`, per-route `loading.tsx`.
- Real page titles. Server wrappers exporting `generateMetadata` with the hypothesis statement, so three open experiments aren't three tabs called "Hunch".

**Done when:** a concluded experiment offers a next experiment, and no route in the app can render an unbranded white page.

## Global Constraints

- **Never add a `Co-Authored-By` or "Generated with" trailer** to any commit or PR in this repo.
- **Prisma uses a custom client output** (`../src/generated/prisma`). After any schema or migration change run `npx prisma generate`, delete `.next`, and restart the dev server — Turbopack caches the old client otherwise.
- Import Prisma types from `@/generated/prisma/client`, never from `@prisma/client`.
- The database must be up before migrating: `npm run db:up`.
- Tests are Vitest, node environment, `src/**/*.test.ts` only (`.tsx` tests are not collected — put logic worth testing in `.ts` files).
- Mock `@/lib/auth` (`auth.api.getSession`) and `@/lib/db` in route tests; `getSession` wraps better-auth and is not mocked directly. Follow `src/app/api/hunch/[id]/start/route.test.ts` exactly.
- Colours come from semantic tokens only — `text-ink`, `text-muted-foreground`, `bg-card`, `border-rule`, `text-s1`, `text-s2`, `text-good`, `text-bad`, `text-neutral`, `font-heading`, `size-(--icon)`. No hex, no inline `style` except per-render computed values.
- Buttons are `@/components/ui/button` with `variant="brand"` and `size="touch"`; icons are Lucide with `aria-hidden`.
- Commit subjects are lowercase conventional commits in this repo's voice — e.g. `feat(verdict): somewhere to go after the answer`. One commit per task.
- The quality gate before any PR: `npm run lint && npm run typecheck && npm test`.

## File Structure

**Created**

- `prisma/migrations/<timestamp>_add_hunch_archived_at/migration.sql` — the one column this phase adds.
- `src/app/api/hunch/[id]/archive/route.ts` — `POST { archived: boolean }`, sets/clears `archivedAt`.
- `src/app/api/hunch/[id]/archive/route.test.ts`
- `src/app/api/hunch/[id]/repeat/route.ts` — `POST`, clones hypothesis + protocol + parameters into a fresh unstarted hunch.
- `src/app/api/hunch/[id]/repeat/route.test.ts`
- `src/lib/export.ts` — pure `toCsv` / `toText` formatters over an `ExportHunch` value.
- `src/lib/export.test.ts`
- `src/app/api/hunch/[id]/export/route.ts` — reads, formats, returns an attachment.
- `src/hooks/use-archive-hunch.ts`, `src/hooks/use-repeat-hunch.ts`
- `src/components/hunch/verdict-actions.tsx` — the three actions plus export, under the narrative.
- `src/components/app/boundary.tsx` — the shared themed frame for error / not-found.
- `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`
- `src/app/home/loading.tsx`, `src/app/hunch/new/loading.tsx`, `src/app/hunch/[id]/loading.tsx`, `src/app/hunch/[id]/protocol/loading.tsx`, `src/app/security/loading.tsx`
- `src/components/hunch/hunch-dashboard.tsx` — the client body lifted out of `src/app/hunch/[id]/page.tsx`.
- `src/components/hunch/protocol-view.tsx` — the client body lifted out of `src/app/hunch/[id]/protocol/page.tsx`.
- `src/lib/titles.ts` — `pageTitle(statement)`, shared by both `generateMetadata` wrappers.
- `src/lib/titles.test.ts`

**Modified**

- `prisma/schema.prisma` — `archivedAt DateTime?` on `Hunch`.
- `src/lib/home.ts` — exclude archived rows from every group; add an `archived` group.
- `src/components/app/home-view.tsx` — the collapsed "archived" section.
- `src/components/verdict.tsx` — render `VerdictActions` under the narrative.
- `src/app/hunch/[id]/page.tsx`, `src/app/hunch/[id]/protocol/page.tsx` — become server wrappers with `generateMetadata`.
- `src/app/home/page.tsx`, `src/app/hunch/new/page.tsx`, `src/app/security/page.tsx`, `src/app/(auth)/*/page.tsx` — static `metadata` exports.

---

### Task 1: `archivedAt` on Hunch, and the archive route

**Files:**
- Modify: `prisma/schema.prisma:11-26`
- Create: `prisma/migrations/<timestamp>_add_hunch_archived_at/migration.sql`
- Create: `src/app/api/hunch/[id]/archive/route.ts`
- Test: `src/app/api/hunch/[id]/archive/route.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `POST /api/hunch/[id]/archive` taking `{ archived: boolean }` and returning `{ id: string; archived: boolean }`; the `Hunch.archivedAt: Date | null` column that Tasks 3 and 5 read.

- [ ] **Step 1: Add the column to the schema**

In `prisma/schema.prisma`, inside `model Hunch`, after `updatedAt`:

```prisma
  /// Set when the user files a finished experiment away. Archived hunches keep
  /// everything — verdict, check-ins, plan — and simply stop competing for
  /// attention on home. Null means live.
  archivedAt DateTime?
```

- [ ] **Step 2: Generate the migration**

```bash
npm run db:up
npx prisma migrate dev --name add_hunch_archived_at
npx prisma generate
```

Expected: a new folder under `prisma/migrations/` whose `migration.sql` is
`ALTER TABLE "Hunch" ADD COLUMN "archivedAt" TIMESTAMP(3);` — nullable, so every existing row is untouched and live.

- [ ] **Step 3: Write the failing test**

Create `src/app/api/hunch/[id]/archive/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/db", () => ({
  db: { hunch: { updateMany: vi.fn() } },
}));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const req = (body?: unknown) =>
  new Request("http://t/api/hunch/h1/archive", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = { params: Promise.resolve({ id: "h1" }) };

describe("POST /api/hunch/[id]/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(db.hunch.updateMany).mockResolvedValue({ count: 1 } as never);
  });

  it("rejects a signed-out caller", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    expect((await POST(req({ archived: true }), params)).status).toBe(401);
    expect(db.hunch.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a body that doesn't say which way", async () => {
    const res = await POST(req({}), params);
    expect(res.status).toBe(400);
    expect(db.hunch.updateMany).not.toHaveBeenCalled();
  });

  it("stamps archivedAt when archiving", async () => {
    const res = await POST(req({ archived: true }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "h1", archived: true });
    const arg = vi.mocked(db.hunch.updateMany).mock.calls[0][0] as {
      where: { id: string; userId: string };
      data: { archivedAt: Date | null };
    };
    expect(arg.where).toEqual({ id: "h1", userId: "u1" });
    expect(arg.data.archivedAt).toBeInstanceOf(Date);
  });

  it("clears archivedAt when restoring", async () => {
    const res = await POST(req({ archived: false }), params);
    expect(res.status).toBe(200);
    const arg = vi.mocked(db.hunch.updateMany).mock.calls[0][0] as {
      data: { archivedAt: Date | null };
    };
    expect(arg.data.archivedAt).toBeNull();
  });

  it("404s a hunch the user doesn't own", async () => {
    vi.mocked(db.hunch.updateMany).mockResolvedValue({ count: 0 } as never);
    expect((await POST(req({ archived: true }), params)).status).toBe(404);
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `npx vitest run src/app/api/hunch/\[id\]/archive/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 5: Write the route**

Create `src/app/api/hunch/[id]/archive/route.ts`:

```ts
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * File a finished experiment away, or bring it back.
 *
 * Home used to grow forever: every verdict the user had ever read stayed on the
 * screen underneath the one they were still logging. Archiving keeps the whole
 * record — verdict, plan, every check-in — and only takes it out of the way.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { archived?: unknown } | null;
  if (typeof body?.archived !== "boolean") {
    return NextResponse.json(
      { error: "Say whether to archive or restore." },
      { status: 400 },
    );
  }
  const archived = body.archived;

  const { id } = await params;
  // Scoped to the owner: updateMany rather than update, so another user's id
  // reports "not found" instead of throwing on a row they can't see.
  const { count } = await db.hunch.updateMany({
    where: { id, userId: session.user.id },
    data: { archivedAt: archived ? new Date() : null },
  });
  if (count === 0) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }

  return NextResponse.json({ id, archived });
}
```

- [ ] **Step 6: Run the test and the gate**

Run: `npx vitest run src/app/api/hunch/\[id\]/archive/route.test.ts && npm run typecheck`
Expected: 5 passing, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/app/api/hunch/\[id\]/archive
git commit -m "feat(archive): a finished experiment can be filed away"
```

---

### Task 2: Run it again — the repeat route

**Files:**
- Create: `src/app/api/hunch/[id]/repeat/route.ts`
- Test: `src/app/api/hunch/[id]/repeat/route.test.ts`

**Interfaces:**
- Consumes: `Hunch` / `Hypothesis` / `Protocol` / `Parameter` as read in `src/app/api/hunch/[id]/route.ts`.
- Produces: `POST /api/hunch/[id]/repeat` returning `201 { id: string }` — the new hunch's id, which Task 3's UI pushes to as `/hunch/<id>/protocol`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/hunch/[id]/repeat/route.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/lib/db", () => ({
  db: { hunch: { findFirst: vi.fn(), create: vi.fn() } },
}));

import { POST } from "./route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const params = { params: Promise.resolve({ id: "h1" }) };
const req = () => new Request("http://t/api/hunch/h1/repeat", { method: "POST" });

/** A concluded hunch with everything a repeat needs to copy. */
const source = {
  id: "h1",
  rawText: "does coffee after lunch wreck my sleep",
  hypothesis: {
    statement: "Coffee after 2pm reduces my sleep quality.",
    outcomeMetric: "sleep quality",
    outcomeType: "continuous",
    confounders: ["alcohol"],
  },
  protocol: {
    design: { phases: [], washoutDays: 1, controls: [], instructions: "x" },
    powerInfo: { minDaysPerPhase: 7 },
    confounders: [{ name: "alcohol" }],
    safetyState: "approved",
  },
  parameters: [
    { label: "sleep quality", type: "continuous", unit: "1-10", min: 1, max: 10, isPrimary: true, sortOrder: 0 },
    { label: "caffeine", type: "binary", unit: null, min: null, max: null, isPrimary: false, sortOrder: 1 },
  ],
};

describe("POST /api/hunch/[id]/repeat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.api.getSession).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(db.hunch.findFirst).mockResolvedValue(source as never);
    vi.mocked(db.hunch.create).mockResolvedValue({ id: "h2" } as never);
  });

  it("rejects a signed-out caller", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);
    expect((await POST(req(), params)).status).toBe(401);
    expect(db.hunch.create).not.toHaveBeenCalled();
  });

  it("404s a hunch the user doesn't own", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue(null as never);
    expect((await POST(req(), params)).status).toBe(404);
  });

  it("refuses a hunch with no plan to repeat", async () => {
    vi.mocked(db.hunch.findFirst).mockResolvedValue({ ...source, protocol: null } as never);
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/plan/i);
    expect(db.hunch.create).not.toHaveBeenCalled();
  });

  it("clones the hypothesis, plan and parameters into an unstarted hunch", async () => {
    const res = await POST(req(), params);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "h2" });

    const arg = vi.mocked(db.hunch.create).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    const data = arg.data as {
      userId: string;
      rawText: string;
      status: string;
      hypothesis: { create: { statement: string } };
      protocol: { create: { startedAt: null; safetyState: string } };
      parameters: { create: { label: string; isPrimary: boolean }[] };
    };
    expect(data.userId).toBe("u1");
    expect(data.rawText).toBe(source.rawText);
    // A repeat is a designed hunch waiting to be started, never a running one.
    expect(data.status).toBe("sharpened");
    expect(data.protocol.create.startedAt).toBeNull();
    expect(data.protocol.create.safetyState).toBe("approved");
    expect(data.hypothesis.create.statement).toBe(source.hypothesis.statement);
    expect(data.parameters.create.map((p) => p.label)).toEqual([
      "sleep quality",
      "caffeine",
    ]);
    expect(data.parameters.create.filter((p) => p.isPrimary)).toHaveLength(1);
  });

  it("carries no check-ins or verdict across", async () => {
    await POST(req(), params);
    const data = (vi.mocked(db.hunch.create).mock.calls[0][0] as { data: object }).data;
    expect(data).not.toHaveProperty("checkIns");
    expect(data).not.toHaveProperty("verdict");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app/api/hunch/\[id\]/repeat/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Write the route**

Create `src/app/api/hunch/[id]/repeat/route.ts`:

```ts
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

/**
 * Run the same experiment again.
 *
 * The verdict used to be the end of the road, and the only way back to the same
 * test was to retype the hunch and sit through sharpening and design a second
 * time for a plan the user had already approved. This copies the hypothesis,
 * the design and the parameters into a fresh hunch that has never run: no
 * check-ins, no verdict, nothing started. The safety state comes across with it
 * — it is the same protocol, already reviewed — so the clone lands on its
 * protocol page ready to start rather than back at the beginning.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const source = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: {
      hypothesis: true,
      protocol: true,
      parameters: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!source || !source.hypothesis) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }
  if (!source.protocol) {
    return NextResponse.json(
      { error: "This hunch has no plan to repeat." },
      { status: 409 },
    );
  }

  const { hypothesis, protocol } = source;
  const clone = await db.hunch.create({
    data: {
      userId: session.user.id,
      rawText: source.rawText,
      // Designed, not started: the repeat still passes through the protocol
      // page so the user picks when it begins.
      status: "sharpened",
      hypothesis: {
        create: {
          statement: hypothesis.statement,
          outcomeMetric: hypothesis.outcomeMetric,
          outcomeType: hypothesis.outcomeType,
          confounders: hypothesis.confounders,
        },
      },
      protocol: {
        create: {
          design: protocol.design as Prisma.InputJsonValue,
          ...(protocol.powerInfo !== null
            ? { powerInfo: protocol.powerInfo as Prisma.InputJsonValue }
            : {}),
          ...(protocol.confounders !== null
            ? { confounders: protocol.confounders as Prisma.InputJsonValue }
            : {}),
          safetyState: protocol.safetyState,
          startedAt: null,
        },
      },
      parameters: {
        create: source.parameters.map((p) => ({
          label: p.label,
          type: p.type,
          unit: p.unit,
          min: p.min,
          max: p.max,
          isPrimary: p.isPrimary,
          sortOrder: p.sortOrder,
        })),
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ id: clone.id }, { status: 201 });
}
```

- [ ] **Step 4: Run the test and the gate**

Run: `npx vitest run src/app/api/hunch/\[id\]/repeat/route.test.ts && npm run typecheck`
Expected: 5 passing, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/hunch/\[id\]/repeat
git commit -m "feat(repeat): the same experiment, without designing it twice"
```

---

### Task 3: The actions under the verdict

**Files:**
- Create: `src/hooks/use-archive-hunch.ts`
- Create: `src/hooks/use-repeat-hunch.ts`
- Create: `src/components/hunch/verdict-actions.tsx`
- Modify: `src/components/verdict.tsx:37-75`
- Modify: `src/app/hunch/[id]/page.tsx` (pass the statement down)

**Interfaces:**
- Consumes: `POST /api/hunch/[id]/archive` (Task 1), `POST /api/hunch/[id]/repeat` (Task 2), `parseSeed` semantics from `src/lib/seed.ts` (the `?seed=` value is already URL-decoded by Next, so the link must `encodeURIComponent` it).
- Produces: `<VerdictActions hunchId statement />`, rendered by `VerdictView`; `useArchiveHunch(hunchId)` and `useRepeatHunch(hunchId)`.

- [ ] **Step 1: Write the archive hook**

Create `src/hooks/use-archive-hunch.ts`:

```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

async function setArchived(hunchId: string, archived: boolean): Promise<void> {
  const res = await fetch(`/api/hunch/${hunchId}/archive`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Couldn't archive this hunch.");
  }
}

/** File a concluded hunch away, or bring it back. Nothing is deleted either way. */
export function useArchiveHunch(hunchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (archived: boolean) => setArchived(hunchId, archived),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hunch-info", hunchId] });
    },
  });
}
```

- [ ] **Step 2: Write the repeat hook**

Create `src/hooks/use-repeat-hunch.ts`:

```ts
"use client";

import { useMutation } from "@tanstack/react-query";

async function repeatHunch(hunchId: string): Promise<{ id: string }> {
  const res = await fetch(`/api/hunch/${hunchId}/repeat`, { method: "POST" });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? "Couldn't set up a repeat of this experiment.");
  }
  return body as { id: string };
}

/** Clone a concluded experiment into a fresh, unstarted one with the same plan. */
export function useRepeatHunch(hunchId: string) {
  return useMutation({ mutationFn: () => repeatHunch(hunchId) });
}
```

- [ ] **Step 3: Write the actions component**

Create `src/components/hunch/verdict-actions.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArchiveIcon,
  DownloadIcon,
  RotateCcwIcon,
  SproutIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArchiveHunch } from "@/hooks/use-archive-hunch";
import { useRepeatHunch } from "@/hooks/use-repeat-hunch";

/**
 * What to do with an answer.
 *
 * The verdict was the payoff and the end of the road: a paragraph, a chart, and
 * nowhere to go. These are the three things a user actually wants next — the
 * same test again, a different question the result raised, or the whole thing
 * out of the way — plus the record itself, in a file they keep.
 */
export function VerdictActions({
  hunchId,
  statement,
}: {
  hunchId: string;
  /** The sharpened hypothesis, so a follow-up starts from what was tested. */
  statement: string;
}) {
  const router = useRouter();
  const repeat = useRepeatHunch(hunchId);
  const archive = useArchiveHunch(hunchId);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  // The follow-up opens the form on the thing that was just settled, so the
  // user edits a sentence instead of starting from an empty box.
  const followUpSeed = encodeURIComponent(`Follow-up to: ${statement}`);

  const error = repeat.error ?? archive.error;

  return (
    <div className="grid gap-3 border-t border-rule pt-5">
      <p className="m-0 text-xs tracking-[0.16em] text-muted-foreground uppercase">
        What now
      </p>

      <div className="flex flex-wrap gap-2.5">
        <Button
          type="button"
          variant="brand"
          size="touch"
          className="border-rule font-bold"
          disabled={repeat.isPending}
          onClick={() =>
            repeat.mutate(undefined, {
              onSuccess: ({ id }) => router.push(`/hunch/${id}/protocol`),
            })
          }
        >
          <RotateCcwIcon data-icon="inline-start" aria-hidden />
          {repeat.isPending ? "Setting it up…" : "Run it again"}
        </Button>

        <Button
          variant="brand"
          size="touch"
          className="border-rule font-bold"
          render={<Link href={`/hunch/new?seed=${followUpSeed}`} />}
        >
          <SproutIcon data-icon="inline-start" aria-hidden />
          Test a follow-up
        </Button>

        <Button
          variant="brand"
          size="touch"
          className="border-rule font-bold"
          render={<a href={`/api/hunch/${hunchId}/export?format=csv`} download />}
        >
          <DownloadIcon data-icon="inline-start" aria-hidden />
          Export
        </Button>

        {!confirmingArchive && (
          <Button
            type="button"
            variant="brand"
            size="touch"
            className="border-transparent px-0.5 text-muted-foreground underline underline-offset-4 hover:border-transparent hover:bg-transparent hover:text-ink"
            onClick={() => setConfirmingArchive(true)}
          >
            <ArchiveIcon data-icon="inline-start" aria-hidden />
            Archive
          </Button>
        )}
      </div>

      {confirmingArchive && (
        <div className="grid gap-2.5">
          <p className="m-0 text-sm leading-relaxed text-ink">
            Archiving takes this off your home screen. The verdict, the plan and
            every day you logged stay exactly where they are.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Button
              type="button"
              variant="brand"
              size="touch"
              className="border-rule font-bold"
              disabled={archive.isPending}
              onClick={() =>
                archive.mutate(true, { onSuccess: () => router.push("/home") })
              }
            >
              {archive.isPending ? "Archiving…" : "Archive it"}
            </Button>
            <Button
              type="button"
              variant="brand"
              size="touch"
              className="border-rule font-bold"
              disabled={archive.isPending}
              onClick={() => setConfirmingArchive(false)}
            >
              Keep it on home
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="m-0 text-sm text-s1">
          {error.message}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Render it under the narrative**

In `src/components/verdict.tsx`: add the import

```tsx
import { VerdictActions } from "@/components/hunch/verdict-actions";
```

change the component signature to take the statement

```tsx
export function VerdictView({
  hunchId,
  statement,
}: {
  hunchId: string;
  /** The hypothesis this verdict answers — seeds the follow-up. */
  statement?: string;
}) {
```

and add the actions as the last child of the `<section>`, after the `{hasStats && <BeliefMeter .../>}` line:

```tsx
      {statement && <VerdictActions hunchId={hunchId} statement={statement} />}
```

- [ ] **Step 5: Pass the statement from the dashboard**

In `src/app/hunch/[id]/page.tsx`, the concluded branch currently reads
`<VerdictView hunchId={id} />`. Change it to:

```tsx
      <VerdictView hunchId={id} statement={info.data?.hypothesis.statement} />
```

The "See the plan" button above it already links the verdict back to the protocol that produced it — that half of the spec line needs no new code, only that the button keeps rendering for a concluded hunch, which it does (`info.data?.protocol` is still set).

- [ ] **Step 6: Verify by hand**

```bash
npm run lint && npm run typecheck && npm test
npm run dev
```

Open a concluded hunch at `/hunch/<id>`. Expected: under the narrative and the meter, a "What now" row with Run it again · Test a follow-up · Export · Archive. "Test a follow-up" opens `/hunch/new` with "Follow-up to: …" already in the textarea. "Run it again" lands on a new hunch's protocol page showing the same plan, unstarted. Archive asks once, then returns to home.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/use-archive-hunch.ts src/hooks/use-repeat-hunch.ts src/components/hunch/verdict-actions.tsx src/components/verdict.tsx src/app/hunch/\[id\]/page.tsx
git commit -m "feat(verdict): somewhere to go after the answer"
```

---

### Task 4: Export as text or CSV

**Files:**
- Create: `src/lib/export.ts`
- Test: `src/lib/export.test.ts`
- Create: `src/app/api/hunch/[id]/export/route.ts`

**Interfaces:**
- Consumes: `ProtocolDesign` from `@/lib/schemas/protocol`, `parseStoredDesign` for tolerant reads.
- Produces: `toCsv(h: ExportHunch): string`, `toText(h: ExportHunch): string`, `exportFilename(h: ExportHunch, format: "csv" | "txt"): string`, and `GET /api/hunch/[id]/export?format=csv|txt`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/export.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { exportFilename, toCsv, toText, type ExportHunch } from "./export";

const hunch: ExportHunch = {
  statement: "Coffee after 2pm reduces my sleep quality.",
  outcomeMetric: "sleep quality",
  rawText: "does coffee wreck my sleep",
  startedAt: new Date("2026-08-01T00:00:00.000Z"),
  parameters: [
    { id: "p1", label: "sleep quality", unit: "1-10" },
    { id: "p2", label: "caffeine, mg", unit: null },
  ],
  checkIns: [
    {
      loggedOn: new Date("2026-08-01T00:00:00.000Z"),
      phase: "A",
      values: [
        { parameterId: "p1", value: 6 },
        { parameterId: "p2", value: 0 },
      ],
    },
    {
      loggedOn: new Date("2026-08-02T00:00:00.000Z"),
      phase: "B",
      values: [{ parameterId: "p1", value: 4 }],
    },
  ],
  verdict: {
    category: "hurt",
    narrative: "Your sleep was worse on the days you had coffee.",
    pEffect: 0.94,
    effect: -1.8,
    ci: [-3.1, -0.4],
    nA: 7,
    nB: 7,
  },
};

describe("toCsv", () => {
  it("puts one column per parameter and one row per day", () => {
    const lines = toCsv(hunch).trim().split("\n");
    expect(lines[0]).toBe("date,phase,sleep quality (1-10),\"caffeine, mg\"");
    expect(lines[1]).toBe("2026-08-01,A,6,0");
    expect(lines).toHaveLength(3);
  });

  it("leaves a cell empty when that parameter wasn't logged that day", () => {
    const lines = toCsv(hunch).trim().split("\n");
    expect(lines[2]).toBe("2026-08-02,B,4,");
  });

  it("quotes a label containing a comma so the columns don't shift", () => {
    expect(toCsv(hunch)).toContain('"caffeine, mg"');
  });

  it("handles a hunch with no check-ins at all", () => {
    const empty = { ...hunch, checkIns: [] };
    expect(toCsv(empty).trim().split("\n")).toHaveLength(1);
  });
});

describe("toText", () => {
  it("leads with the hypothesis and the verdict", () => {
    const out = toText(hunch);
    expect(out).toContain("Coffee after 2pm reduces my sleep quality.");
    expect(out).toContain("It hurt");
    expect(out).toContain("94% sure");
    expect(out).toContain("Your sleep was worse");
  });

  it("lists every logged day", () => {
    const out = toText(hunch);
    expect(out).toContain("2026-08-01");
    expect(out).toContain("2026-08-02");
  });

  it("says so plainly when there is no verdict yet", () => {
    const out = toText({ ...hunch, verdict: null });
    expect(out).toMatch(/still running|no verdict/i);
  });
});

describe("exportFilename", () => {
  it("slugs the statement and keeps the extension", () => {
    expect(exportFilename(hunch, "csv")).toBe("coffee-after-2pm-reduces-my-sleep-quality.csv");
  });

  it("falls back to a generic name when the statement slugs to nothing", () => {
    expect(exportFilename({ ...hunch, statement: "!!!" }, "txt")).toBe("hunch.txt");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/export.test.ts`
Expected: FAIL — cannot resolve `./export`.

- [ ] **Step 3: Write the formatters**

Create `src/lib/export.ts`:

```ts
/**
 * The experiment as a file the user keeps.
 *
 * A verdict the app can show but not hand over is a record the user does not
 * own. Two shapes: CSV for the raw days, so the numbers can go into a
 * spreadsheet or a doctor's hands, and text for the story — hypothesis, plan,
 * verdict, every logged day underneath it.
 *
 * Pure functions over plain values: the route reads, this formats, so both
 * shapes are testable without a database.
 */

export type ExportParameter = { id: string; label: string; unit: string | null };

export type ExportCheckIn = {
  loggedOn: Date;
  phase: string;
  values: { parameterId: string; value: number }[];
};

export type ExportVerdict = {
  category: string;
  narrative: string;
  pEffect: number;
  effect: number;
  ci: [number, number];
  nA: number;
  nB: number;
};

export type ExportHunch = {
  statement: string;
  outcomeMetric: string;
  rawText: string;
  startedAt: Date | null;
  parameters: ExportParameter[];
  checkIns: ExportCheckIn[];
  verdict: ExportVerdict | null;
};

/** The verdict categories, in the words the app uses on screen. */
const CATEGORY_TEXT: Record<string, string> = {
  helped: "It helped",
  hurt: "It hurt",
  inconclusive_no_effect: "No detectable effect",
  inconclusive_insufficient: "Not enough data",
};

/** `2026-08-01` — the UTC calendar date, which is how check-ins are stored. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** RFC 4180: quote a field that holds a comma, a quote or a newline. */
function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** The column header for a parameter — its unit in brackets when it has one. */
function columnLabel(p: ExportParameter): string {
  return p.unit ? `${p.label} (${p.unit})` : p.label;
}

/** One row per logged day, one column per parameter. Unlogged cells stay empty. */
export function toCsv(h: ExportHunch): string {
  const header = ["date", "phase", ...h.parameters.map(columnLabel)].map(csvCell);
  const rows = h.checkIns.map((c) => {
    const byId = new Map(c.values.map((v) => [v.parameterId, v.value]));
    return [
      isoDate(c.loggedOn),
      c.phase,
      ...h.parameters.map((p) => {
        const v = byId.get(p.id);
        return v === undefined ? "" : String(v);
      }),
    ].map(csvCell);
  });
  return [header, ...rows].map((r) => r.join(",")).join("\n") + "\n";
}

/** The whole experiment as prose: what was tested, what came back, every day. */
export function toText(h: ExportHunch): string {
  const lines: string[] = [];
  lines.push("HUNCH — an n-of-1 experiment");
  lines.push("");
  lines.push(`Hypothesis: ${h.statement}`);
  lines.push(`Outcome measured: ${h.outcomeMetric}`);
  lines.push(`In your words: ${h.rawText}`);
  lines.push(`Started: ${h.startedAt ? isoDate(h.startedAt) : "not started"}`);
  lines.push("");

  if (h.verdict) {
    const v = h.verdict;
    lines.push("VERDICT");
    lines.push(`${CATEGORY_TEXT[v.category] ?? v.category} — ${Math.round(v.pEffect * 100)}% sure`);
    lines.push(v.narrative);
    lines.push(
      `Effect: ${v.effect} (95% credible interval ${v.ci[0]} to ${v.ci[1]}); ` +
        `${v.nA} baseline days, ${v.nB} intervention days.`,
    );
  } else {
    lines.push("VERDICT");
    lines.push("No verdict yet — this experiment is still running.");
  }
  lines.push("");

  lines.push("THE DAYS");
  if (h.checkIns.length === 0) {
    lines.push("Nothing logged yet.");
  } else {
    for (const c of h.checkIns) {
      const byId = new Map(c.values.map((v) => [v.parameterId, v.value]));
      const readings = h.parameters
        .filter((p) => byId.has(p.id))
        .map((p) => `${columnLabel(p)}: ${byId.get(p.id)}`)
        .join("; ");
      lines.push(`${isoDate(c.loggedOn)}  phase ${c.phase}  ${readings}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** A filename the user can find later: the hypothesis, slugged. */
export function exportFilename(h: ExportHunch, format: "csv" | "txt"): string {
  const slug = h.statement
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${slug || "hunch"}.${format}`;
}
```

- [ ] **Step 4: Run the test until it passes**

Run: `npx vitest run src/lib/export.test.ts`
Expected: 9 passing.

- [ ] **Step 5: Write the route**

Create `src/app/api/hunch/[id]/export/route.ts`:

```ts
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { exportFilename, toCsv, toText, type ExportHunch } from "@/lib/export";

/**
 * Hand the experiment over as a file — `?format=csv` for the raw days,
 * `?format=txt` for the whole story. Content-Disposition: attachment, so the
 * browser saves it rather than rendering a wall of text in a tab.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(await headers());
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const format =
    new URL(request.url).searchParams.get("format") === "txt" ? "txt" : "csv";

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    include: {
      hypothesis: true,
      protocol: true,
      verdict: true,
      parameters: { orderBy: { sortOrder: "asc" } },
      checkIns: {
        orderBy: { loggedOn: "asc" },
        include: { values: { select: { parameterId: true, value: true } } },
      },
    },
  });
  if (!hunch || !hunch.hypothesis) {
    return NextResponse.json({ error: "Hunch not found." }, { status: 404 });
  }

  const data: ExportHunch = {
    statement: hunch.hypothesis.statement,
    outcomeMetric: hunch.hypothesis.outcomeMetric,
    rawText: hunch.rawText,
    startedAt: hunch.protocol?.startedAt ?? null,
    parameters: hunch.parameters.map((p) => ({
      id: p.id,
      label: p.label,
      unit: p.unit,
    })),
    checkIns: hunch.checkIns.map((c) => ({
      loggedOn: c.loggedOn,
      phase: c.phase,
      values: c.values,
    })),
    verdict: hunch.verdict
      ? {
          category: hunch.verdict.category,
          narrative: hunch.verdict.narrative,
          pEffect: hunch.verdict.pEffect,
          effect: hunch.verdict.effect,
          ci: [hunch.verdict.ciLow, hunch.verdict.ciHigh],
          nA: hunch.verdict.nA,
          nB: hunch.verdict.nB,
        }
      : null,
  };

  const body = format === "csv" ? toCsv(data) : toText(data);
  return new Response(body, {
    headers: {
      "Content-Type":
        format === "csv" ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(data, format)}"`,
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 6: Verify by hand**

```bash
npm run lint && npm run typecheck && npm test
npm run dev
```

Visit `/api/hunch/<id>/export?format=csv` while signed in. Expected: a downloaded `.csv` named after the hypothesis, with a header row and one row per logged day. Then `?format=txt`. Signed out: 401 JSON.

- [ ] **Step 7: Commit**

```bash
git add src/lib/export.ts src/lib/export.test.ts src/app/api/hunch/\[id\]/export
git commit -m "feat(export): the record, in a file you keep"
```

---

### Task 5: Archived hunches leave home (and can come back)

**Files:**
- Modify: `src/lib/home.ts:36-43` (the `HomeData` type) and `:55-70`, `:150-165` (the query and the grouping)
- Modify: `src/components/app/home-view.tsx` (a collapsed archived section)

**Interfaces:**
- Consumes: `Hunch.archivedAt` (Task 1), `useArchiveHunch` (Task 3).
- Produces: `HomeData.archived: HomeHunch[]`, and the guarantee that `today`/`running`/`needsSetup`/`verdicts` never contain an archived hunch.

- [ ] **Step 1: Add `archived` to the read model**

In `src/lib/home.ts`, extend `HomeData`:

```ts
export type HomeData = {
  hasAny: boolean;
  today: HomeHunch[];
  running: HomeHunch[];
  needsSetup: HomeHunch[];
  verdicts: HomeHunch[];
  /** Filed away: still whole, just not competing for the screen. */
  archived: HomeHunch[];
};
```

and carry the flag on each row by adding to `HomeHunch`:

```ts
  /** Null while the hunch is live. ISO string once the user files it away. */
  archivedOn: string | null;
```

- [ ] **Step 2: Select and map the column**

In `getHomeData`, the `db.hunch.findMany` call needs no `where` change — an archived hunch is still the user's — but the mapped row must carry the flag. In the returned object literal inside `hunches.map`, alongside `loggedToday`, add:

```ts
      archivedOn: h.archivedAt ? h.archivedAt.toISOString() : null,
```

- [ ] **Step 3: Group with archived held out**

Replace the return block at the end of `getHomeData` with:

```ts
  const isToday = (h: HomeHunch) => h.loggableToday && !h.loggedToday;
  // Archived hunches are held out of every working group before anything else
  // is decided, so a filed-away experiment can't reappear as "check in today".
  const live = mapped.filter((h) => h.archivedOn === null);

  return {
    hasAny: mapped.length > 0,
    today: live.filter(isToday),
    // In-flight roster excludes what's already actionable under Today, so a
    // not-yet-logged experiment isn't shown twice on the same screen.
    running: live.filter((h) => h.status === "running" && !isToday(h)),
    needsSetup: live.filter(
      (h) => !h.verdict && (h.status === "sharpened" || h.status === "draft"),
    ),
    verdicts: live.filter((h) => h.verdict),
    archived: mapped.filter((h) => h.archivedOn !== null),
  };
```

- [ ] **Step 4: Show the archive on home**

In `src/components/app/home-view.tsx`, add a section as the last child of the
`flex flex-col gap-[clamp(40px,7vh,72px)]` wrapper — after the "Finish setting
up" block:

```tsx
          {data.archived.length > 0 && (
            <section>
              <details className="group">
                <summary className="flex h-11 cursor-pointer list-none items-center gap-2 text-xs tracking-[0.24em] text-muted-foreground uppercase hover:text-ink">
                  <span aria-hidden className="text-s1 group-open:hidden">
                    +
                  </span>
                  <span aria-hidden className="hidden text-s1 group-open:inline">
                    −
                  </span>
                  {data.archived.length} archived
                </summary>
                <div className={cn(GRID, "mt-[clamp(12px,1.6vw,18px)]")}>
                  {data.archived.map((h) => (
                    <Link key={h.id} href={`/hunch/${h.id}`} className={cn(CARD, "app-card")}>
                      <p className={cn(CARD_EYEBROW, "text-muted-foreground")}>
                        Archived
                        <ArrowRightIcon
                          aria-hidden
                          className="ml-1 inline-block size-(--icon) align-[-0.15em]"
                        />
                      </p>
                      <Statement h={h} />
                    </Link>
                  ))}
                </div>
              </details>
            </section>
          )}
```

- [ ] **Step 5: Verify by hand**

```bash
npm run lint && npm run typecheck && npm test
npm run dev
```

Archive a concluded hunch from its verdict. Expected: it leaves "Verdict ready" immediately and appears behind "1 archived" at the bottom of home; opening it still shows the full verdict, the meter and the plan. Nothing was deleted.

- [ ] **Step 6: Commit**

```bash
git add src/lib/home.ts src/components/app/home-view.tsx
git commit -m "feat(home): the archive, one line out of the way"
```

---

### Task 6: Themed boundaries — nothing renders white

**Files:**
- Create: `src/components/app/boundary.tsx`
- Create: `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`
- Create: `src/app/home/loading.tsx`, `src/app/hunch/new/loading.tsx`, `src/app/hunch/[id]/loading.tsx`, `src/app/hunch/[id]/protocol/loading.tsx`, `src/app/security/loading.tsx`

**Interfaces:**
- Consumes: `Skeleton` from `@/components/ui/skeleton`, `Button` from `@/components/ui/button`, the palette on `:root` in `globals.css`.
- Produces: `<Boundary eyebrow title body action />` — the one frame both error screens and the 404 render inside.

- [ ] **Step 1: Write the shared frame**

Create `src/components/app/boundary.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * The screen the app shows when there is nothing else to show.
 *
 * A mistyped URL used to drop the user out of a black app onto Next's default
 * white page — no header, no type, no way back. This is the same ground and the
 * same voice as everything else, and it always offers a door.
 */
export function Boundary({
  eyebrow,
  title,
  body,
  action,
}: {
  eyebrow: string;
  title: string;
  body: string;
  /** The way out. A retry button on an error, a link home on a 404. */
  action: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[620px] flex-col justify-center px-[clamp(20px,5vw,40px)] py-16">
      <p className="m-0 text-xs tracking-[0.24em] text-muted-foreground uppercase">
        <span aria-hidden className="text-s1">
          ✦
        </span>{" "}
        {eyebrow}
      </p>
      <h1 className="mt-4 mb-0 font-heading text-[clamp(30px,4.4vw,48px)] font-bold tracking-[-0.02em] text-ink">
        {title}
      </h1>
      <p className="mt-4 mb-8 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <div className="flex flex-wrap gap-2.5">{action}</div>
    </main>
  );
}

/** The link every boundary offers, so no screen is a dead end. */
export function HomeLink({ children = "Back to home" }: { children?: React.ReactNode }) {
  return (
    <Button
      variant="brand"
      size="touch"
      className="border-rule font-bold"
      render={<Link href="/home" />}
    >
      {children}
    </Button>
  );
}
```

- [ ] **Step 2: The route error boundary**

Create `src/app/error.tsx`:

```tsx
"use client";

import { Boundary, HomeLink } from "@/components/app/boundary";
import { Button } from "@/components/ui/button";

/**
 * Any uncaught render or data error inside the app. Next requires this to be a
 * client component and hands it a `reset` that re-renders the segment.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Boundary
      eyebrow="Something broke"
      title="That didn't load."
      body="The error is on our side, not yours. Nothing you logged is affected — try again, or head back home."
      action={
        <>
          <Button
            type="button"
            variant="brand"
            size="touch"
            className="border-rule font-bold"
            onClick={reset}
          >
            Try again
          </Button>
          <HomeLink />
        </>
      }
    />
  );
}
```

- [ ] **Step 3: The root error boundary**

Create `src/app/global-error.tsx`. This one replaces the whole document when the
root layout itself throws, so it must render its own `<html>` and `<body>` and
carry the `dark` class and the stylesheet — otherwise it is exactly the white
page this task exists to remove:

```tsx
"use client";

import "./globals.css";
import { Boundary, HomeLink } from "@/components/app/boundary";

export default function GlobalError() {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full">
        <Boundary
          eyebrow="Something broke"
          title="The app failed to start."
          body="This one is ours. Reload the page — if it keeps happening, your data is safe and waiting."
          action={<HomeLink />}
        />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: The 404**

Create `src/app/not-found.tsx`:

```tsx
import { Boundary, HomeLink } from "@/components/app/boundary";

export default function NotFound() {
  return (
    <Boundary
      eyebrow="404"
      title="Nothing here."
      body="This page doesn't exist — or the experiment it pointed at has been deleted."
      action={<HomeLink />}
    />
  );
}
```

- [ ] **Step 5: Per-route loading states**

Each of these is what the user sees while the server component above it awaits
the session and the data. They mirror the shape of the screen that follows, so
nothing jumps when it arrives.

Create `src/app/home/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function HomeLoading() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-[clamp(20px,5vw,40px)] py-16" aria-hidden>
      <Skeleton className="h-11 w-52" />
      <Skeleton className="mt-[clamp(28px,5vh,48px)] h-3 w-32" />
      <Skeleton className="mt-[18px] h-40 w-full rounded-lg" />
      <Skeleton className="mt-[clamp(40px,7vh,72px)] h-3 w-32" />
      <Skeleton className="mt-[18px] h-32 w-full rounded-lg" />
    </div>
  );
}
```

Create `src/app/hunch/[id]/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function HunchLoading() {
  return (
    <div aria-hidden>
      <Skeleton className="h-12 w-72" />
      <Skeleton className="mt-4 h-11 w-40" />
      <Skeleton className="mt-[26px] h-56 w-full rounded-lg" />
    </div>
  );
}
```

Create `src/app/hunch/[id]/protocol/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function ProtocolLoading() {
  return (
    <div aria-hidden>
      <Skeleton className="h-12 w-64" />
      <Skeleton className="mt-[26px] h-24 w-full rounded-lg" />
      <Skeleton className="mt-5 h-48 w-full rounded-xl" />
    </div>
  );
}
```

Create `src/app/hunch/new/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function NewHunchLoading() {
  return (
    <div aria-hidden>
      <Skeleton className="h-12 w-80" />
      <Skeleton className="mt-[26px] h-40 w-full rounded-lg" />
      <Skeleton className="mt-5 h-11 w-44" />
    </div>
  );
}
```

Create `src/app/security/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function SecurityLoading() {
  return (
    <div className="mx-auto w-full max-w-[880px] px-[clamp(20px,5vw,40px)] py-16" aria-hidden>
      <Skeleton className="h-11 w-56" />
      <Skeleton className="mt-8 h-40 w-full rounded-lg" />
      <Skeleton className="mt-6 h-40 w-full rounded-lg" />
    </div>
  );
}
```

Note: `/hunch/*` loading files render inside the `AppShell` from
`src/app/hunch/layout.tsx`, so they must not paint their own `<main>` or page
padding — the two that live under `/home` and `/security` do, because those
pages mount the shell themselves.

- [ ] **Step 6: Verify every boundary by hand**

```bash
npm run lint && npm run typecheck && npm test
npm run dev
```

- Visit `/does-not-exist` → the themed 404 on the app's ground, with a working "Back to home".
- Visit `/hunch/definitely-not-an-id` → the app's own error or 404, never a white page.
- Throttle the network in devtools and load `/home` → the skeleton, then the real screen, with no layout jump.

- [ ] **Step 7: Commit**

```bash
git add src/components/app/boundary.tsx src/app/error.tsx src/app/global-error.tsx src/app/not-found.tsx src/app/home/loading.tsx src/app/security/loading.tsx src/app/hunch
git commit -m "style(boundaries): no screen in this app is white"
```

---

### Task 7: Real page titles

**Files:**
- Create: `src/lib/titles.ts`
- Test: `src/lib/titles.test.ts`
- Create: `src/components/hunch/hunch-dashboard.tsx` (the client body moved out of the page)
- Create: `src/components/hunch/protocol-view.tsx` (the client body moved out of the page)
- Modify: `src/app/hunch/[id]/page.tsx` — becomes a server wrapper
- Modify: `src/app/hunch/[id]/protocol/page.tsx` — becomes a server wrapper
- Modify: `src/app/layout.tsx:6-9`, `src/app/home/page.tsx`, `src/app/hunch/new/page.tsx`, `src/app/security/page.tsx`, `src/app/(auth)/signin/page.tsx`, `src/app/(auth)/signup/page.tsx`, `src/app/(auth)/forgot-password/page.tsx`, `src/app/(auth)/reset-password/page.tsx`, `src/app/(auth)/2fa/page.tsx`

**Interfaces:**
- Consumes: `db`, `getSession` (both already used by `src/app/hunch/new/page.tsx` in exactly this shape).
- Produces: `pageTitle(statement: string): string`; `HunchDashboard({ id }: { id: string })`; `ProtocolView({ id }: { id: string })`.

- [ ] **Step 1: Write the failing title test**

Create `src/lib/titles.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pageTitle } from "./titles";

describe("pageTitle", () => {
  it("uses the statement as the tab name", () => {
    expect(pageTitle("Coffee after 2pm reduces my sleep quality.")).toBe(
      "Coffee after 2pm reduces my sleep quality",
    );
  });

  it("drops a trailing full stop, which reads wrong in a tab", () => {
    expect(pageTitle("It works.")).toBe("It works");
  });

  it("truncates a long statement on a word boundary", () => {
    const long =
      "Taking a ten minute walk immediately after lunch improves my measured afternoon focus score";
    const out = pageTitle(long);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });

  it("falls back for an empty statement", () => {
    expect(pageTitle("   ")).toBe("Hunch");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/titles.test.ts`
Expected: FAIL — cannot resolve `./titles`.

- [ ] **Step 3: Write it**

Create `src/lib/titles.ts`:

```ts
/** How much of a hypothesis survives in a browser tab before it is cut off. */
const MAX = 60;

/**
 * A hypothesis, as a tab name.
 *
 * Every page in the app was called "Hunch", so three open experiments were
 * three identical tabs and browser history was useless. The statement is the
 * only thing that tells them apart.
 */
export function pageTitle(statement: string): string {
  const clean = statement.trim().replace(/\s+/g, " ").replace(/\.$/, "");
  if (!clean) return "Hunch";
  if (clean.length <= MAX) return clean;

  const cut = clean.slice(0, MAX - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:]+$/, "")}…`;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/titles.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Move the dashboard body into a component**

`git mv` is not right here — the file changes role. Create
`src/components/hunch/hunch-dashboard.tsx` holding the *entire current contents*
of `src/app/hunch/[id]/page.tsx` with three changes:

1. Keep the `"use client";` line at the top.
2. Change the signature from a `params` promise to a plain id, and drop the `use` import:

```tsx
export function HunchDashboard({ id }: { id: string }) {
```

   — deleting the `const { id } = use(params);` line and removing `use` from the
   `react` import (the file no longer imports anything from `react` if `use` was
   the only one; check before deleting the line).
3. Keep the `statement` prop passed to `VerdictView` from Task 3 exactly as it is.

- [ ] **Step 6: Turn the page into a server wrapper**

Replace `src/app/hunch/[id]/page.tsx` entirely with:

```tsx
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { HunchDashboard } from "@/components/hunch/hunch-dashboard";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { pageTitle } from "@/lib/titles";

/**
 * The tab name is the hypothesis, not the product name. Three experiments open
 * at once used to be three tabs called "Hunch"; this is the only thing on the
 * page that tells them apart. Resolved on the server so the title is in the
 * HTML rather than swapped in after hydration.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await getSession(await headers());
  // The template appends " · hunch", so these fallbacks stay bare.
  if (!session) return { title: "Experiment" };

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    select: { rawText: true, hypothesis: { select: { statement: true } } },
  });
  if (!hunch) return { title: "Experiment" };

  return { title: pageTitle(hunch.hypothesis?.statement ?? hunch.rawText) };
}

export default async function HunchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession(await headers());
  if (!session) redirect("/signin");

  const { id } = await params;
  // A mistyped or deleted id renders the themed 404 rather than a dashboard
  // whose every query 404s underneath it.
  const exists = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!exists) notFound();

  return <HunchDashboard id={id} />;
}
```

- [ ] **Step 7: Do the same for the protocol page**

Create `src/components/hunch/protocol-view.tsx` holding the entire current
contents of `src/app/hunch/[id]/protocol/page.tsx` (keep `"use client";`), with
the default export changed to a named one taking the id:

```tsx
export function ProtocolView({ id }: { id: string }) {
```

dropping its `const { id } = use(params);` line and the `use` import.

Then replace `src/app/hunch/[id]/protocol/page.tsx` entirely with:

```tsx
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ProtocolView } from "@/components/hunch/protocol-view";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { pageTitle } from "@/lib/titles";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await getSession(await headers());
  if (!session) return { title: "The plan" };

  const { id } = await params;
  const hunch = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    select: { rawText: true, hypothesis: { select: { statement: true } } },
  });
  if (!hunch) return { title: "The plan" };

  return { title: `Plan · ${pageTitle(hunch.hypothesis?.statement ?? hunch.rawText)}` };
}

export default async function ProtocolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession(await headers());
  if (!session) redirect("/signin");

  const { id } = await params;
  const exists = await db.hunch.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });
  if (!exists) notFound();

  return <ProtocolView id={id} />;
}
```

- [ ] **Step 8: Static titles for the rest**

`src/app/layout.tsx` keeps `title: "Hunch"` as the fallback but gains a template
so every page reads as part of the product. The suffix is lowercase `hunch`,
matching the brand as the five auth pages already write it:

```ts
export const metadata: Metadata = {
  title: {
    default: "Hunch",
    template: "%s · hunch",
  },
  description: "A copilot for n-of-1 experiments on yourself.",
};
```

The five `(auth)` pages **already** export a `metadata` with the suffix written
by hand — `title: "Sign in · hunch"` and so on. The template would double it
("Sign in · hunch · hunch"), so each must drop its own suffix. Edit the existing
export in place, changing only the string:

- `src/app/(auth)/signin/page.tsx:5` — `title: "Sign in"`
- `src/app/(auth)/signup/page.tsx:5` — `title: "Create account"`
- `src/app/(auth)/forgot-password/page.tsx:5` — `title: "Reset password"`
- `src/app/(auth)/reset-password/page.tsx:5` — `title: "New password"`
- `src/app/(auth)/2fa/page.tsx:5` — `title: "Two-factor"`

The three authed server pages have no `metadata` export at all. Add one after
their imports, along with `import type { Metadata } from "next";`:

- `src/app/home/page.tsx` — `export const metadata: Metadata = { title: "Your experiments" };`
- `src/app/hunch/new/page.tsx` — `export const metadata: Metadata = { title: "New hunch" };`
- `src/app/security/page.tsx` — `export const metadata: Metadata = { title: "Account & security" };`

All eight are server components (checked — none carries `"use client"`), so the
export is legal in each and no wrapper is needed. The two dynamic hunch pages
get their titles from `generateMetadata` in Steps 6 and 7, and the template
appends the suffix to those too.

- [ ] **Step 9: Verify by hand**

```bash
npm run lint && npm run typecheck && npm test
npm run dev
```

Open two different experiments in two tabs. Expected: two different tab names,
each the hypothesis, neither "Hunch". `/hunch/<id>/protocol` reads
"Plan · …". `/home` reads "Your experiments · Hunch". A bad id renders the
themed 404 from Task 6.

- [ ] **Step 10: Commit**

```bash
git add src/lib/titles.ts src/lib/titles.test.ts src/components/hunch/hunch-dashboard.tsx src/components/hunch/protocol-view.tsx src/app
git commit -m "feat(titles): three experiments, three tabs"
```

---

## Closing the phase

- [ ] **Full gate**

```bash
npm run lint && npm run typecheck && npm test
```

Expected: lint clean, typecheck clean, every test passing (242 on main, plus the ~18 this phase adds).

- [ ] **Check the merge against live main before opening the PR**

The PR's mergeable flag is computed against a possibly stale base — two phases
that both touched a screen have reported CLEAN and then conflicted the moment
the other landed. Check locally:

```bash
git fetch origin main
git merge --no-commit --no-ff origin/main || git merge --abort
```

- [ ] **Open the PR**

```bash
gh pr create --base main --title "feat: endings and edges" --body "$(cat <<'BODY'
Phase 07 of the repair schedule. The verdict stops being a cul-de-sac, and no route in the app can render an unbranded white page.

- Three actions under the verdict: Run it again (clones the plan into a fresh unstarted hunch), Test a follow-up (seeds /hunch/new from the statement), Archive (nullable `archivedAt`; nothing is deleted).
- Export the whole experiment as CSV or text from `GET /api/hunch/[id]/export`.
- Themed `error.tsx`, `global-error.tsx`, `not-found.tsx`, and a `loading.tsx` per route.
- Real page titles — server wrappers exporting `generateMetadata` with the hypothesis.

Closes four audit findings: the verdict is a cul-de-sac; missing error/loading/404 boundaries; long AI waits get a line of text; every page title is "Hunch".
BODY
)"
```

- [ ] **Update the repair-schedule memory** — phase 07 done, and with it every phase of the schedule.
