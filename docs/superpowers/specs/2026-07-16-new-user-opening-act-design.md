# New-User Opening Act — Design

**Date:** 2026-07-16
**Branch:** `feat/opening-act`
**Status:** Approved scope, pending spec review

## Problem

A brand-new user (zero experiments) logs in and lands on `/home`, which renders
its empty state. Two problems make the first minute fall flat:

1. **`/home` empty state is static and bland.** Sharp typography, but no motion
   and lots of dead space, so it reads as unfinished — colder than the landing
   promised. (The fix is motion and rhythm, not the bot — see the guiding
   principle below.)
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

## Guiding Principle — the bot is the AI, not decoration

The confirm-bot is the symbol of the computing/hunch-confirming AI. It appears
**only where that AI is present or doing significant work** — never as generic
ornament. Consequence:

- **`/home` = no bot.** Arriving on home is not a moment of AI work, so the bot
  would be decoration. Home is freshened by motion, spacing, card polish, and the
  `✦` starburst (a brand *motif*, not the AI symbol).
- **Add-hunch = bot present.** Sharpening a raw hunch is literally the AI
  computing and then confirming. The bot's presence there *is* its meaning.
- Future screens follow the same rule: show the bot at moments of AI
  computation/confirmation (e.g. protocol design, verdict reveal), nowhere else.

## Component 1 — `/home` empty state freshening

**File:** `src/components/app/home-view.tsx` (`EmptyState` + `HomeView` wrapper).

### No mascot here
Per the guiding principle, `/home` shows no bot. The empty state is freshened by
motion, rhythm, and the `✦` starburst motif only. This keeps the bot meaningful
for the moments that follow.

### Starburst accent
- Use the `✦` starburst (existing brand motif, and/or `public/starburst.png`) as
  a quiet decorative accent behind or beside the "Got a hunch? **Prove it.**"
  headline — subtle, low-contrast, not a focal element. This adds warmth without
  invoking the AI symbol.

### Entrance motion (`motion` / Framer v12)
- On load, stagger the empty-state children in: headline → sub-copy →
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

### The AI moment — computing → confirmed (the bot's screen)
This is the one place in this chunk where the bot appears, because it is the one
place the AI does its work. It spans both the pending and success states:

- **While sharpening (pending):** the compose form recedes and the confirm-bot is
  mounted, reading as the AI *computing* the hunch. A quiet "Sharpening…" label
  accompanies it. (The bot's WebGL canvas is lazy-loaded via `next/dynamic`,
  `ssr:false`; a `✦` starburst holds its box until it mounts, so no layout shift.)
- **On success:** the bot completes its spin-in intro (`play` prop) as the moment
  of *confirmation*. The sharpened result animates in below: the falsifiable
  hypothesis statement, outcome metric, outcome type, confounders, and any
  recalled priors — restyled to the paper/ink language (replacing the old flat
  card look).
- A prominent **"Design the protocol →"** button links to
  `/hunch/${id}/protocol`. **This closes the dead end.**

If the bot's presence for the full pending duration feels heavy in practice,
fall back to mounting it only on success; the principle (bot = AI at work) still
holds. Implementer's call during build, validated in the manual pass.

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
  1. Log in as a zero-experiment user → `/home` empty state shows the staggered
     entrance + starburst accent, and **no bot**.
  2. Click "Drop your first hunch →" → focused add-hunch page.
  3. Also click an example → add-hunch page arrives with textarea prefilled.
  4. Submit → confirm-bot spins in, sharpened card appears,
     "Design the protocol →" is present and routes to `/hunch/[id]/protocol`.
  5. Toggle `prefers-reduced-motion` → no animation, final state intact.
- Gate before PR: `npm run typecheck`, `npm run lint`, `npm test` all clean.

## Risks / Notes

- **WebGL weight:** the bot loads only on the add-hunch page (not `/home`), and
  only at the sharpen moment, lazy via `ssr:false` with a starburst placeholder —
  so its cost lands exactly where its meaning does, and nowhere else.
- **Bot as meaning, not decoration:** the guiding principle is load-bearing. Any
  future urge to sprinkle the bot for charm should be checked against
  "is the AI actually working here?"
- **Option A is a visual outlier** (only authed page without the shell) — this is
  deliberate, to make the first action feel like a moment. "← home" keeps nav
  one click away.
- **Reduced-motion** is a first-class path, not an afterthought.
