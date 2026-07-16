# New-User Opening Act — Design

**Date:** 2026-07-16
**Branch:** `feat/opening-act`
**Status:** Approved scope, pending spec review

## Problem

A brand-new user (zero experiments) logs in and lands on `/home`, which renders
its empty state. Two problems make the first minute fall flat:

1. **`/home` empty state is static and bland.** Sharp typography, but no motion,
   no brand character, lots of dead space. The charming confirm-bot from the
   landing page does not follow the user past login, so the app feels colder
   than the marketing promised.
2. **The add-hunch page is a dead end.** `/hunch/new` sharpens a raw hunch into a
   falsifiable hypothesis and renders it — then stops. There is no
   "Design the protocol →" continuation, so a new user completes their first
   action and has nowhere to go. The page is also pre-brand (plain Tailwind,
   `text-2xl font-bold`), visually unrelated to the rest of the app.

These are the first two beats of the same journey — arrive, then act — so they
are designed and built together for consistency.

## Non-Goals

- Not rebuilding `/home`'s populated sections (Today / Verdicts / In flight /
  Needs setup). They get the same entrance motion, nothing more.
- Not touching `/hunch/[id]` or `/hunch/[id]/protocol` yet. The add-hunch page
  only *links* to the protocol page; rebranding it is a later chunk.
- No new backend, schema, or API changes. `POST /api/hunch` is unchanged.
- No new dependencies. Everything needed (`motion`, `@react-three/fiber`,
  `three`, the confirm-bot) is already installed.

## Design Language (established, not invented here)

The authed app is a **light "paper/ink" editorial theme**, distinct from the dark
landing page. Tokens already in use across `/home` and the app shell:

- `--paper` (bg), `--ink` (fg), `--rule` (hairline border), `--muted` (dim text)
- `--s1` / `--s2` — coral→violet gradient accents
- `✦` starburst motif; Clash Display for headings, Space Mono for labels/buttons

All new UI uses these tokens. No new colors, no dark theme on authed pages.

## Component 1 — `/home` empty state freshening

**File:** `src/components/app/home-view.tsx` (`EmptyState` + `HomeView` wrapper).

### Mascot companion
- Reuse the landing confirm-bot (`src/components/landing/hero-robot.tsx`).
- Load it via `next/dynamic` with `ssr: false` so its WebGL canvas never blocks
  server render or first paint. While it loads, reserve its box with a static
  `✦` starburst fallback so layout does not shift.
- Placed beside the "Got a hunch? **Prove it.**" headline as a small hero
  companion (bounded box, ~clamp(160–220px)). Plays its spin-in intro on mount.
- Responsive: on narrow screens the mascot sits above the headline, not beside.

### Entrance motion (`motion` / Framer v12)
- On load, stagger the empty-state children in: headline → mascot → sub-copy →
  primary CTA → example rows, each a short fade + rise (~8–12px), ~60–80ms apart.
- `HomeView`'s populated branch gets the same treatment at the section level
  (heading, then each section), lighter and faster. Respect
  `prefers-reduced-motion`: when set, render final state with no animation.

### Polish
- Deepen `.app-card:hover`: in addition to the existing border-color shift, add a
  subtle lift (`translateY(-2px)`) and a gradient top-edge accent on hover.
- Tighten empty-state vertical rhythm so it reads as composed, not half-filled.

## Component 2 — Add-hunch page (Option A: focused moment)

**Files:** `src/app/hunch/new/page.tsx` (rewrite), and either extend
`src/components/hunch-card.tsx` or add a page-local result block.

### Layout — no app shell
A self-contained centered column on the paper background:
- Small quiet top-left "← home" link (the only escape; not emphasized).
- Clash Display prompt: **"What's nagging you?"**
- One generous auto-sized textarea, paper-tone background, `--rule` border,
  focus ring in `--s1`. Prefilled from the `?seed=` query param (the home
  examples already link with `?seed=`), so a seeded arrival lands ready to sharpen.
- Space Mono primary button: **"Sharpen it"** (disabled while empty / pending;
  label → "Sharpening…" when pending).

### Success state — the confirm-bot moment
On a successful sharpen (`useCreateHunch` returns the persisted hunch):
- The compose form recedes (fades/shrinks up, stays available but de-emphasized).
- The **confirm-bot spins in** (same `play`-prop intro) as the moment of
  confirmation — this is exactly what the bot was built for.
- The sharpened result animates in below: the falsifiable hypothesis statement,
  outcome metric, outcome type, confounders, and any recalled priors —
  restyled to the paper/ink language (this replaces the old flat card look).
- A prominent **"Design the protocol →"** button links to
  `/hunch/${id}/protocol`. **This closes the dead end.**

### Error / edge states
- Sharpen failure: inline message in `--s1`, form stays filled and editable, no
  navigation.
- Empty submit is blocked by the disabled button (defense: also guard in handler).
- `?seed=` is decoded and trimmed; empty or absent seed → empty textarea.

## Data Flow (unchanged)

```
/home EmptyState ──"Drop your first hunch →"──▶ /hunch/new
                └──"✦ <example>" (?seed=…)────▶ /hunch/new?seed=…

/hunch/new: textarea ──useCreateHunch──▶ POST /api/hunch
   → { hunch: { id, rawText, status:"sharpened", hypothesis }, priors }
   → render sharpened result + confirm-bot
   → "Design the protocol →" ──▶ /hunch/[id]/protocol   (next chunk owns that page)
```

No API, schema, or hook signature changes. `useCreateHunch` already returns the
persisted hunch with its `id`, which is all the continuation link needs.

## Testing

- **Unit (vitest):** the existing suite must stay green (97 tests). Add a small
  test for the `?seed=` parse/prefill helper (decode + trim + empty handling) if
  extracted as a pure function.
- **Manual / verify:** exercise the real flow in the running app —
  1. Log in as a zero-experiment user → `/home` empty state shows mascot +
     staggered entrance.
  2. Click "Drop your first hunch →" → focused add-hunch page.
  3. Also click an example → add-hunch page arrives with textarea prefilled.
  4. Submit → confirm-bot spins in, sharpened card appears,
     "Design the protocol →" is present and routes to `/hunch/[id]/protocol`.
  5. Toggle `prefers-reduced-motion` → no animation, final state intact.
- Gate before PR: `npm run typecheck`, `npm run lint`, `npm test` all clean.

## Risks / Notes

- **WebGL weight on `/home`:** mitigated by `ssr:false` dynamic import +
  starburst fallback; the canvas is small and loads after paint.
- **Option A is a visual outlier** (only authed page without the shell) — this is
  deliberate, to make the first action feel like a moment. "← home" keeps nav
  one click away.
- **Reduced-motion** is a first-class path, not an afterthought.
