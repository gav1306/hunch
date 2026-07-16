# New-User Opening Act Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the new user's first two beats life — freshen `/home`'s empty state with motion (no bot), and rebuild the add-hunch page as a focused Option-A moment where the confirm-bot marks the AI computing→confirming, ending with a "Design the protocol →" link that fixes today's dead end.

**Architecture:** `/hunch/new` becomes a server component that reads `?seed=` and renders a client `NewHunchForm`; the form drives `useCreateHunch` and shows the confirm-bot (lazy WebGL) only while sharpening and on success. `/home`'s `HomeView` gains `motion` entrance stagger and a starburst accent; the shared `.app-card` hover deepens. No API, schema, or dependency changes.

**Tech Stack:** Next 16 App Router (server + client components), React 19, TypeScript, `motion` v12 (`motion/react`), `@react-three/fiber` + `three` (existing confirm-bot), inline-style + CSS-var theming (the established authed-app pattern).

## Global Constraints

- **No new dependencies.** Everything needed is installed (`motion`, `@react-three/fiber`, `three`, `next/dynamic`, the confirm-bot).
- **No API / schema / hook-signature changes.** `POST /api/hunch` and `useCreateHunch` are unchanged.
- **Bot = AI, never decoration.** The confirm-bot appears ONLY on the add-hunch page (the AI moment). `/home` gets NO bot.
- **Paper/ink theme tokens only** on authed pages: `--paper`, `--ink`, `--rule`, `--muted`, `--s1`, `--s2`. No new colors, no dark theme. Clash Display for headings, Space Mono for labels/buttons, `✦` starburst motif.
- **Respect `prefers-reduced-motion`** via `useReducedMotion()` from `motion/react`: when set, render final state with no animation.
- **Gate before each PR:** `npm run typecheck`, `npm run lint`, `npm test` all clean (existing suite is 97 tests — must stay green).
- **Commit style:** Conventional Commits. NO Co-Authored-By / Generated-with trailers.

---

### Task 1: `parseSeed` helper (pure, TDD)

The `?seed=` value arrives already URL-decoded by Next's `searchParams`. This helper documents that contract and normalizes it to a textarea prefill (trim, handle absent). Pure function → real TDD cycle.

**Files:**
- Create: `src/lib/seed.ts`
- Test: `src/lib/seed.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseSeed(raw?: string | null): string` — used by `src/app/hunch/new/page.tsx` (Task 2).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/seed.test.ts
import { describe, expect, it } from "vitest";
import { parseSeed } from "./seed";

describe("parseSeed", () => {
  it("returns empty string for undefined", () => {
    expect(parseSeed(undefined)).toBe("");
  });

  it("returns empty string for null", () => {
    expect(parseSeed(null)).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(parseSeed("  coffee wrecks my sleep  ")).toBe("coffee wrecks my sleep");
  });

  it("passes a normal seed through unchanged", () => {
    expect(parseSeed("Does coffee after lunch wreck my sleep?")).toBe(
      "Does coffee after lunch wreck my sleep?",
    );
  });

  it("collapses a whitespace-only seed to empty", () => {
    expect(parseSeed("   ")).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/seed.test.ts`
Expected: FAIL — cannot resolve `./seed` / `parseSeed is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/seed.ts
/**
 * Normalize a `?seed=` query value into a textarea prefill.
 * Next's `searchParams` already URL-decodes the value, so this only trims and
 * handles the absent case — do NOT decodeURIComponent again (would corrupt a
 * literal `%`).
 */
export function parseSeed(raw?: string | null): string {
  return (raw ?? "").trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/seed.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/seed.ts src/lib/seed.test.ts
git commit -m "feat(hunch): parseSeed helper for add-hunch prefill"
```

---

### Task 2: Add-hunch page — focused Option-A moment with the confirm-bot

Rebuild `/hunch/new` as a shell-less focused page. Server component guards auth and reads the seed; a client `NewHunchForm` runs the compose → AI moment → result flow. A thin `ConfirmBot` wrapper isolates the lazy WebGL import. The old pre-brand `HunchCard` is deleted (only this page used it).

**Files:**
- Create: `src/components/hunch/confirm-bot.tsx`
- Create: `src/components/hunch/new-hunch-form.tsx`
- Modify (rewrite): `src/app/hunch/new/page.tsx`
- Delete: `src/components/hunch-card.tsx`

**Interfaces:**
- Consumes: `parseSeed` (Task 1); `useCreateHunch()` from `@/hooks/use-create-hunch` returning `HunchWithHypothesis = { id: string; rawText: string; status: string; hypothesis: { id: string; statement: string; outcomeMetric: string; outcomeType: string; confounders: string[] }; priors: { sourceHunchId: string; cause: string; confidence: number }[] }`; `HeroRobot({ play?: boolean })` from `@/components/landing/hero-robot`; `auth` from `@/lib/auth`.
- Produces: default-exported `NewHunchPage` server component at route `/hunch/new`; `NewHunchForm({ seed: string })`; `ConfirmBot({ play: boolean; size?: number })`.

- [ ] **Step 1: Create the `ConfirmBot` wrapper**

Isolates the WebGL import so only this component pulls in three.js, lazy and client-only, with the starburst placeholder holding the box (no layout shift).

```tsx
// src/components/hunch/confirm-bot.tsx
"use client";

import dynamic from "next/dynamic";

function StarFallback() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/starburst.png"
      alt=""
      aria-hidden
      style={{ width: "60%", height: "60%", objectFit: "contain", opacity: 0.45, margin: "20% auto", display: "block" }}
    />
  );
}

const HeroRobot = dynamic(
  () => import("@/components/landing/hero-robot").then((m) => m.HeroRobot),
  { ssr: false, loading: () => <StarFallback /> },
);

/** The confirm-bot in a bounded, centered box. `play` triggers the spin-in intro. */
export function ConfirmBot({ play, size = 200 }: { play: boolean; size?: number }) {
  return (
    <div style={{ width: size, height: size, margin: "0 auto" }} aria-hidden>
      <HeroRobot play={play} />
    </div>
  );
}
```

- [ ] **Step 2: Create `NewHunchForm` (compose → AI moment → result)**

```tsx
// src/components/hunch/new-hunch-form.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmBot } from "@/components/hunch/confirm-bot";
import { useCreateHunch, type HunchWithHypothesis } from "@/hooks/use-create-hunch";

const label: React.CSSProperties = {
  fontSize: 10.5,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "var(--muted)",
};

function Pill({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "3px 10px",
        fontSize: 12,
        textTransform: "capitalize",
        border: muted ? "none" : "1px solid var(--rule)",
        background: muted ? "color-mix(in srgb,var(--paper) 82%,var(--ink))" : "transparent",
        color: "var(--ink)",
      }}
    >
      {children}
    </span>
  );
}

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt style={{ ...label, marginBottom: 6 }}>{l}</dt>
      <dd style={{ margin: 0, fontSize: 14, color: "var(--ink)" }}>{children}</dd>
    </div>
  );
}

function Result({ hunch, onReset }: { hunch: HunchWithHypothesis; onReset: () => void }) {
  const h = hunch.hypothesis;
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ background: "color-mix(in srgb,var(--paper) 90%,var(--ink))", border: "1px solid var(--rule)", padding: "clamp(20px,2.4vw,28px)" }}>
        <p style={{ margin: 0, fontSize: 13, fontStyle: "italic", color: "var(--muted)" }}>
          &ldquo;{hunch.rawText}&rdquo;
        </p>
        <h2 style={{ margin: "14px 0 0", fontFamily: "'Clash Display',sans-serif", fontWeight: 600, fontSize: "clamp(18px,2.2vw,24px)", lineHeight: 1.25, letterSpacing: "-0.01em", color: "var(--ink)" }}>
          {h.statement}
        </h2>
        <dl style={{ margin: "18px 0 0", display: "grid", gap: 14 }}>
          <Field label="Outcome metric">{h.outcomeMetric}</Field>
          <Field label="Outcome type"><Pill>{h.outcomeType}</Pill></Field>
          {h.confounders.length > 0 && (
            <Field label="Watch for confounders">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {h.confounders.map((c) => <Pill key={c} muted>{c}</Pill>)}
              </div>
            </Field>
          )}
        </dl>
        {hunch.priors.length > 0 && (
          <div style={{ marginTop: 20, borderTop: "1px solid var(--rule)", paddingTop: 16 }}>
            <div style={label}>You already learned</div>
            <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
              {hunch.priors.map((p) => (
                <li key={p.sourceHunchId} style={{ fontSize: 13, color: "var(--ink)" }}>
                  <span style={{ fontStyle: "italic" }}>{p.cause}</span>{" "}
                  <span style={{ color: "var(--muted)" }}>({Math.round(p.confidence * 100)}% confident)</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <Link
          href={`/hunch/${hunch.id}/protocol`}
          style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "14px 24px", border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--paper)", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase", textDecoration: "none" }}
        >
          Design the protocol →
        </Link>
        <button
          type="button"
          onClick={onReset}
          style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Space Mono',monospace", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--muted)" }}
        >
          start over
        </button>
      </div>
    </div>
  );
}

export function NewHunchForm({ seed }: { seed: string }) {
  const [rawText, setRawText] = useState(seed);
  const createHunch = useCreateHunch();

  const phase: "idle" | "computing" | "done" = createHunch.data
    ? "done"
    : createHunch.isPending
      ? "computing"
      : "idle";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = rawText.trim();
    if (!text || createHunch.isPending) return;
    createHunch.mutate(text);
  }

  function reset() {
    createHunch.reset();
    setRawText("");
  }

  return (
    <main style={{ minHeight: "100dvh", background: "var(--paper)", color: "var(--ink)" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "clamp(20px,6vh,56px) 20px 96px" }}>
        <Link href="/home" style={{ ...label, textDecoration: "none" }}>← home</Link>

        {phase !== "done" && (
          <div style={{ marginTop: 40, opacity: phase === "computing" ? 0.4 : 1, transition: "opacity 300ms ease", pointerEvents: phase === "computing" ? "none" : "auto" }}>
            <h1 style={{ margin: 0, fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(30px,4.4vw,48px)", letterSpacing: "-0.02em", color: "var(--ink)" }}>
              What&apos;s nagging you?
            </h1>
            <p style={{ margin: "14px 0 0", fontSize: 14.5, lineHeight: 1.7, color: "var(--muted)" }}>
              Drop a gut feeling about your life. The coach sharpens it into something you can actually test.
            </p>

            <form onSubmit={onSubmit} style={{ marginTop: 26 }}>
              <textarea
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={3}
                autoFocus
                disabled={phase === "computing"}
                placeholder="coffee after lunch wrecks my sleep…"
                style={{ width: "100%", resize: "none", padding: "14px 16px", background: "color-mix(in srgb,var(--paper) 82%,var(--ink))", border: "1px solid var(--rule)", color: "var(--ink)", fontFamily: "inherit", fontSize: 15, lineHeight: 1.5, outline: "none" }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--s1)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--rule)")}
              />
              <button
                type="submit"
                disabled={phase === "computing" || !rawText.trim()}
                style={{ marginTop: 14, padding: "14px 26px", border: "1px solid var(--ink)", background: rawText.trim() ? "var(--ink)" : "transparent", color: rawText.trim() ? "var(--paper)" : "var(--muted)", cursor: rawText.trim() ? "pointer" : "not-allowed", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 13, letterSpacing: "0.12em", textTransform: "uppercase" }}
              >
                {phase === "computing" ? "Sharpening…" : "Sharpen it"}
              </button>
            </form>

            {createHunch.isError && (
              <p style={{ marginTop: 16, fontSize: 13, color: "var(--s1)" }}>
                {(createHunch.error as Error).message}
              </p>
            )}
          </div>
        )}

        {phase !== "idle" && (
          <div style={{ marginTop: phase === "done" ? 8 : 36 }}>
            <ConfirmBot play={phase === "done"} size={200} />
            {phase === "computing" && (
              <p style={{ textAlign: "center", marginTop: 4, fontFamily: "'Space Mono',monospace", fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)" }}>
                Sharpening…
              </p>
            )}
          </div>
        )}

        {phase === "done" && createHunch.data && (
          <Result hunch={createHunch.data} onReset={reset} />
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Rewrite the page as an auth-guarded server component**

```tsx
// src/app/hunch/new/page.tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NewHunchForm } from "@/components/hunch/new-hunch-form";
import { auth } from "@/lib/auth";
import { parseSeed } from "@/lib/seed";

export default async function NewHunchPage({
  searchParams,
}: {
  searchParams: Promise<{ seed?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/signin");

  const { seed } = await searchParams;
  return <NewHunchForm seed={parseSeed(seed)} />;
}
```

- [ ] **Step 4: Delete the dead `HunchCard`**

```bash
git rm src/components/hunch-card.tsx
```

Confirm nothing else imports it:

Run: `grep -rn "hunch-card\|HunchCard" src/`
Expected: no matches.

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean, no output errors. (If `useCreateHunch` does not already export the `HunchWithHypothesis` type, add `export` to its `type HunchWithHypothesis` declaration in `src/hooks/use-create-hunch.ts` — it is imported by `new-hunch-form.tsx`.)

- [ ] **Step 6: Manual verification (the flow + dead-end fix)**

Ensure DB is up (`docker compose up -d`) and dev server running (`npm run dev`). As a signed-in user:
1. Visit `/hunch/new` → focused page, no app shell, "What's nagging you?" heading, autofocused textarea.
2. Visit `/hunch/new?seed=Does%20coffee%20wreck%20my%20sleep%3F` → textarea prefilled with "Does coffee wreck my sleep?".
3. Type a hunch → "Sharpen it" → form dims, confirm-bot mounts with "Sharpening…", then on success the bot spins in and the sharpened result appears.
4. Confirm a **"Design the protocol →"** button is present and navigates to `/hunch/<id>/protocol`.
5. Click "start over" → returns to the empty compose state.
6. Not-signed-in visit to `/hunch/new` → redirects to `/signin`.

Expected: all six hold. If the confirm-bot mounting during the full pending duration feels heavy, change `phase !== "idle"` to `phase === "done"` on the bot block (spec-sanctioned fallback) and re-verify.

- [ ] **Step 7: Commit**

```bash
git add src/app/hunch/new/page.tsx src/components/hunch/confirm-bot.tsx src/components/hunch/new-hunch-form.tsx src/hooks/use-create-hunch.ts
git commit -m "feat(hunch): focused add-hunch page with confirm-bot + protocol handoff

Rebuild /hunch/new as a shell-less Option-A moment on the paper/ink
theme. The confirm-bot marks the AI computing (while sharpening) and
confirming (spin-in on success). Add the missing 'Design the protocol'
handoff, fixing the post-sharpen dead end. Guard auth server-side and
prefill from ?seed=. Delete the pre-brand HunchCard (only this page used it)."
```

---

### Task 3: `/home` empty-state freshening (motion, no bot)

Add `motion` entrance stagger to `HomeView`, a subtle starburst accent behind the empty-state headline, and deepen the shared card hover. No bot — per the guiding principle, arriving on home is not an AI moment.

**Files:**
- Modify: `src/components/app/home-view.tsx`
- Modify: `src/components/app/app-shell.tsx` (the `<style>` block, `.app-card` hover)

**Interfaces:**
- Consumes: `motion`, `useReducedMotion` from `motion/react`.
- Produces: no new exported symbols; `HomeView` and `EmptyState` behavior change only.

- [ ] **Step 1: Import motion into `home-view.tsx`**

At the top of `src/components/app/home-view.tsx`, below the existing imports, add:

```tsx
import { motion, useReducedMotion } from "motion/react";
```

Then add these stagger variants near the top-level consts (e.g. after `EXAMPLES`):

```tsx
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const } },
};
```

- [ ] **Step 2: Animate the empty state + add the starburst accent**

Replace the `EmptyState` function body's outer wrapper and children with motion equivalents. The new `EmptyState`:

```tsx
function EmptyState() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      variants={container}
      initial={reduce ? "show" : "hidden"}
      animate="show"
      style={{ position: "relative", maxWidth: 620 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/starburst.png"
        alt=""
        aria-hidden
        style={{ position: "absolute", top: -40, right: -20, width: 150, opacity: 0.08, pointerEvents: "none", userSelect: "none" }}
      />

      <motion.div
        variants={item}
        style={{ fontFamily: "'Clash Display',sans-serif", fontWeight: 700, fontSize: "clamp(28px,4vw,44px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: "var(--ink)" }}
      >
        Got a hunch?{" "}
        <span style={{ backgroundImage: "linear-gradient(92deg,var(--s1),var(--s2))", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent" }}>
          Prove it.
        </span>
      </motion.div>

      <motion.p variants={item} style={{ margin: "16px 0 28px", fontSize: 14, lineHeight: 1.7, color: "var(--muted)" }}>
        Drop a gut feeling about your life. The coach sharpens it into something
        you can actually test — then the math calls it.
      </motion.p>

      <motion.div variants={item}>
        <Link
          href="/hunch/new"
          className="app-newhunch"
          style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "15px 26px", border: "1px solid var(--ink)", background: "var(--ink)", color: "var(--paper)", fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", textDecoration: "none" }}
        >
          Drop your first hunch →
        </Link>
      </motion.div>

      <motion.div variants={item} style={{ marginTop: 40 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 14 }}>
          For instance
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {EXAMPLES.map((q) => (
            <Link
              key={q}
              href={`/hunch/new?seed=${encodeURIComponent(q)}`}
              className="app-card"
              style={{ ...cardBase, display: "flex", alignItems: "center", gap: 12, fontSize: 13.5 }}
            >
              <span style={{ color: "var(--s1)" }}>✦</span>
              {q}
            </Link>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 3: Add a light entrance to the populated home heading**

In `HomeView`, wrap the `<h1>Hi, {firstName}.</h1>` so it fades in. Change the `h1` opening tag to `motion.h1` and add `initial`/`animate` guarded by reduced-motion. At the top of `HomeView`, add:

```tsx
const reduce = useReducedMotion();
```

Then replace the `<h1 ...>` element with:

```tsx
<motion.h1
  initial={reduce ? false : { opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
  style={{
    margin: "0 0 clamp(28px,5vh,48px)",
    fontFamily: "'Clash Display',sans-serif",
    fontWeight: 700,
    fontSize: "clamp(30px,4vw,46px)",
    letterSpacing: "-0.02em",
    color: "var(--ink)",
  }}
>
  Hi, {firstName}.
</motion.h1>
```

(The existing `<style>` line and the rest of `HomeView` are unchanged.)

- [ ] **Step 4: Deepen the card hover in `app-shell.tsx`**

In `src/components/app/app-shell.tsx`, inside the `<style>{...}` block, replace these two lines:

```css
        .app-card{transition:border-color 240ms ease,background 240ms ease;}
        .app-card:hover{border-color:var(--ink);}
```

with:

```css
        .app-card{transition:border-color 240ms ease,background 240ms ease,transform 240ms ease,box-shadow 240ms ease;}
        .app-card:hover{border-color:var(--ink);transform:translateY(-2px);box-shadow:0 8px 28px -14px color-mix(in srgb,var(--ink) 45%,transparent);}
        @media (prefers-reduced-motion: reduce){.app-card:hover{transform:none;}}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 6: Manual verification**

With the dev server running, as a signed-in **zero-experiment** user:
1. Visit `/home` → empty state children fade/rise in sequence (headline → copy → CTA → examples); a faint starburst sits behind the headline; **no bot** anywhere.
2. Hover an example row / any `.app-card` → it lifts slightly with a soft shadow.
3. As a user **with** experiments, `/home` heading fades in and cards lift on hover.
4. Enable OS "Reduce motion" → reload `/home` → everything renders in final position instantly, cards do not lift. 

Expected: all four hold.

- [ ] **Step 7: Commit**

```bash
git add src/components/app/home-view.tsx src/components/app/app-shell.tsx
git commit -m "feat(home): entrance motion + starburst accent + deeper card hover

Freshen the /home empty state with a staggered fade-in, a faint
starburst motif behind the headline, and a lifting card hover — no bot,
per the principle that the bot marks AI moments only. Reduced-motion
renders the final state with no animation."
```

---

### Task 4: Full gate + PR

**Files:** none (integration).

- [ ] **Step 1: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck clean, lint silent, tests green (existing 97 + 5 new `parseSeed` = 102).

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/opening-act
gh pr create --title "feat: new-user opening act — home motion + focused add-hunch page" --body "$(cat <<'EOF'
Freshens the first two beats of the new-user journey.

## What
- **/hunch/new** rebuilt as a focused, shell-less Option-A page on the paper/ink theme. The confirm-bot marks the AI moment: computing while sharpening, spin-in on success. Adds the missing **Design the protocol →** handoff — fixes the post-sharpen dead end. Prefills from ?seed=, guards auth server-side.
- **/home** empty state freshened: staggered entrance motion, faint starburst accent, deeper card hover. No bot (arriving is not an AI moment).
- Deleted the pre-brand HunchCard (only the old add-hunch page used it).

## Principle
The confirm-bot is the symbol of the computing/confirming AI — shown only where the AI works, never as decoration. Spec: docs/superpowers/specs/2026-07-16-new-user-opening-act-design.md

## Verification
- npm run typecheck — clean
- npm run lint — silent
- npm test — 102 pass
- Manual: seed prefill, sharpen → bot → protocol handoff, start-over, auth redirect, reduced-motion all confirmed.
EOF
)"
```

- [ ] **Step 3: Confirm CI green**

Run: `gh pr view --json mergeable,mergeStateStatus,statusCheckRollup`
Expected: `MERGEABLE` / `CLEAN`, `verify` check SUCCESS.

---

## Self-Review

**Spec coverage:**
- Problem 1 (`/home` bland) → Task 3 (motion, starburst, hover). ✓
- Problem 2 (add-hunch dead end + pre-brand) → Task 2 (rebuild + "Design the protocol →"). ✓
- Guiding principle (bot = AI, no bot on home) → Task 3 has no bot; Task 2 mounts it at the AI moment. ✓
- Component 1 (no mascot, starburst accent, entrance motion, card polish, tightened rhythm) → Task 3 steps 1–4. ✓
- Component 2 (no shell, Clash prompt, seeded textarea, Sharpen, bot computing→confirmed, sharpened result restyled, Design-protocol link, ← home, inline errors) → Task 2 steps 1–3. ✓
- Data flow (unchanged API/hook; link uses `hunch.id`) → Task 2 uses `useCreateHunch` as-is, links `/hunch/${hunch.id}/protocol`. ✓
- Testing (seed unit test; manual flow; reduced-motion; gate) → Task 1 test, Task 2/3 manual steps, Task 4 gate. ✓
- Risks (WebGL isolated to add-hunch; reduced-motion first-class) → ConfirmBot isolates the import; reduced-motion in Tasks 2–3. ✓

**Placeholder scan:** No TBD/TODO; all steps carry concrete code or exact commands. ✓

**Type consistency:** `HunchWithHypothesis` shape used in `new-hunch-form.tsx` matches the hook's exported type (Task 2 Step 5 ensures it is exported). `parseSeed(raw?: string | null)` signature identical in Task 1 and its call site in Task 2 Step 3. `ConfirmBot({ play, size })` and `HeroRobot({ play })` props match their definitions. ✓
